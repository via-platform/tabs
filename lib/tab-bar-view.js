const {Disposable, CompositeDisposable} = require('via');
const {ipcRenderer} = require('electron');
const TabView = require('./tab-view');
let BrowserWindow;

module.exports = class TabBarView {
    constructor(pane, location){
        this.pane = pane;
        this.location = location;
        this.element = document.createElement('ul');
        this.element.classList.add('tab-bar');
        this.element.classList.add('inset-panel');
        this.element.setAttribute('is', 'via-tabs');
        this.element.setAttribute('tabindex', -1);
        this.element.setAttribute('location', this.location);

        this.tabs = [];
        this.tabsByElement = new WeakMap();
        this.subscriptions = new CompositeDisposable();

        this.subscriptions.add(via.commands.add(this.pane.getElement(), {
            'tabs:keep-pending-tab': () => this.terminatePendingStates(),
            'tabs:close-tab': () => this.closeTab(this.getActiveTab()),
            'tabs:close-other-tabs': () => this.closeOtherTabs(this.getActiveTab()),
            'tabs:close-tabs-to-right': () => this.closeTabsToRight(this.getActiveTab()),
            'tabs:close-tabs-to-left': () => this.closeTabsToLeft(this.getActiveTab()),
            'tabs:close-saved-tabs': () => this.closeSavedTabs(),
            'tabs:close-all-tabs': event => {
                event.stopPropagation();
                this.closeAllTabs();
            },
            'tabs:open-in-new-window': () => this.openInNewWindow()
        }));

        let addElementCommands = (commands) => {
            let commandsWithPropagationStopped = {};

            Object.keys(commands).forEach(name => {
                commandsWithPropagationStopped[name] = event => {
                    event.stopPropagation();
                    commands[name]();
                };
            });

            this.subscriptions.add(via.commands.add(this.element, commandsWithPropagationStopped));
        };

        addElementCommands({
            'tabs:close-tab': () => this.closeTab(),
            'tabs:close-other-tabs': () => this.closeOtherTabs(),
            'tabs:close-tabs-to-right': () => this.closeTabsToRight(),
            'tabs:close-tabs-to-left': () => this.closeTabsToLeft(),
            'tabs:close-all-tabs': () => this.closeAllTabs(),
            'tabs:split-up': () => this.splitTab('splitUp'),
            'tabs:split-down': () => this.splitTab('splitDown'),
            'tabs:split-left': () => this.splitTab('splitLeft'),
            'tabs:split-right': () => this.splitTab('splitRight')
        });

        this.element.addEventListener('mouseenter', this.onMouseEnter.bind(this));
        this.element.addEventListener('mouseleave', this.onMouseLeave.bind(this));
        this.element.addEventListener('dragstart', this.onDragStart.bind(this));
        this.element.addEventListener('dragend', this.onDragEnd.bind(this));
        this.element.addEventListener('dragleave', this.onDragLeave.bind(this));
        this.element.addEventListener('dragover', this.onDragOver.bind(this));
        this.element.addEventListener('drop', this.onDrop.bind(this));

        this.paneContainer = this.pane.getContainer();
        this.pane.getItems().forEach(item => this.addTabForItem(item));

        this.subscriptions.add(this.pane.onDidDestroy(() => this.destroy()));
        this.subscriptions.add(this.pane.onDidAddItem(({item, index}) => this.addTabForItem(item, index)));
        this.subscriptions.add(this.pane.onDidMoveItem(({item, newIndex}) => this.moveItemTabToIndex(item, newIndex)));
        this.subscriptions.add(this.pane.onDidRemoveItem(({item}) => this.removeTabForItem(item)));
        this.subscriptions.add(this.pane.onDidChangeActiveItem(item => this.updateActiveTab()));
        this.subscriptions.add(via.config.observe('tabs.tabScrolling', this.updateTabScrolling.bind(this)));
        this.subscriptions.add(via.config.observe('tabs.tabScrollingThreshold', () => this.updateTabScrollingThreshold()));
        this.subscriptions.add(via.config.observe('tabs.alwaysShowTabBar', () => this.updateTabBarVisibility()));

        this.updateActiveTab();

        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));

        this.onDropOnOtherWindow = this.onDropOnOtherWindow.bind(this);
        ipcRenderer.on('tab:dropped', this.onDropOnOtherWindow);
    }

    destroy(){
        ipcRenderer.removeListener('tab:dropped', this.onDropOnOtherWindow);
        this.subscriptions.dispose();
        this.element.remove();
    }

    terminatePendingStates(){
        for(let tab of this.getTabs()){
            if(tab.terminatePendingState){
                tab.terminatePendingState();
            }
        }
    }

    addTabForItem(item, index){
        let tabView = new TabView({
            item: item,
            pane: this.pane,
            tabs: this.tabs,
            didClickCloseIcon: () => this.closeTab(tabView),
            location: this.location
        });

        if(this.isItemMovingBetweenPanes){
            tabView.terminatePendingState();
        }

        this.tabsByElement.set(tabView.element, tabView);
        this.insertTabAtIndex(tabView, index);

        if(via.config.get('tabs.addNewTabsAtEnd') && !this.isItemMovingBetweenPanes){
            this.pane.moveItem(item, this.pane.getItems().length - 1);
        }
    }

    moveItemTabToIndex(item, index){
        let tabIndex = this.tabs.findIndex(t => t.item === item);

        if(tabIndex !== -1){
            let tab = this.tabs[tabIndex];
            tab.element.remove();
            this.tabs.splice(tabIndex, 1);
            this.insertTabAtIndex(tab, index);
        }
    }

    insertTabAtIndex(tab, index){
        let followingTab = index ? this.tabs[index] : undefined;

        if(followingTab){
            this.element.insertBefore(tab.element, followingTab.element);
            this.tabs.splice(index, 0, tab);
        }else{
            this.element.appendChild(tab.element);
            this.tabs.push(tab);
        }

        tab.updateTitle();
        this.updateTabBarVisibility();
    }

    removeTabForItem(item){
        let tabIndex = this.tabs.findIndex(t => t.item === item);

        if(tabIndex !== -1){
            let tab = this.tabs[tabIndex];
            this.tabs.splice(tabIndex, 1);
            this.tabsByElement.delete(tab);
            tab.destroy();
        }

        this.getTabs().forEach(tab => tab.updateTitle());
        this.updateTabBarVisibility();
    }

    updateTabBarVisibility(){
        if(!via.config.get('tabs.alwaysShowTabBar') && !this.shouldAllowDrag()){
            this.element.classList.add('hidden');
        }else{
            this.element.classList.remove('hidden');
        }
    }

    getTabs(){
        return this.tabs.slice();
    }

    tabAtIndex(index){
        return this.tabs[index];
    }

    tabForItem(item){
        return this.tabs.find(t => t.item === item);
    }

    setActiveTab(tabView){
        if(tabView && tabView !== this.activeTab){
            if(this.activeTab){
                this.activeTab.element.classList.remove('active');
            }

            this.activeTab = tabView;
            this.activeTab.element.classList.add('active');
            this.activeTab.element.scrollIntoView(false);
        }
    }

    getActiveTab(){
        return this.tabForItem(this.pane.getActiveItem());
    }

    updateActiveTab(){
        return this.setActiveTab(this.tabForItem(this.pane.getActiveItem()));
    }

    closeTab(tab){
        tab = tab || this.rightClickedTab;

        if(tab){
            this.pane.destroyItem(tab.item);
        }
    }

    openInNewWindow(tab){
        tab = tab || this.rightClickedTab;
        let item = tab ? tab.item : undefined;

        if(!item){
            return;
        }

        let itemURI;

        if(typeof item.getURI === 'function'){
            itemURI = item.getURI();
        }else if(typeof item.getPath === 'function'){
            itemURI = item.getPath();
        }else if(typeof item.getUri === 'function'){
            itemURI = item.getUri();
        }

        if(!itemURI){
            return;
        }

        this.closeTab(tab);

        for(const t of this.getTabs()){
            t.element.style.maxWidth = '';
        }

        let pathsToOpen = [via.project.getPaths(), itemURI].reduce((a, b) => a.concat(b), []);
        via.open({pathsToOpen: pathsToOpen, newWindow: true, devMode: via.devMode, safeMode: via.safeMode});
    }

    splitTab(fn){
        let item = this.rightClickedTab && this.rightClickedTab.item;

        if(item){
            let copiedItem = item.copy && item.copy();
            this.pane[fn]({items: [copiedItem]});
        }
    }

    closeOtherTabs(active){
        let tabs = this.getTabs();
        active = active || this.rightClickedTab;

        if(!active){
            return;
        }

        for(let tab of tabs){
            if(tab !== active){
                this.closeTab(tab);
            }
        }
    }

    closeTabsToRight(active){
        let tabs = this.getTabs();
        active = active || this.rightClickedTab;
        let index = tabs.indexOf(active);

        if(index === -1){
            return;
        }

        for(let i = index + 1; i < tabs.length; i++){
            this.closeTab(tab);
        }
    }

    closeTabsToLeft(active){
        let tabs = this.getTabs();
        active = active || this.rightClickedTab;
        let index = tabs.indexOf(active);

        for(let i = 0; i < index; i++){
            this.closeTab(tabs[i]);
        }
    }

    closeAllTabs(){
        return this.getTabs.forEach(tab => this.closeTab(tab));
    }

    getWindowId(){
        this.windowId = this.windowId || via.getCurrentWindow().id;
        return this.windowId;
    }

    shouldAllowDrag(){
        return (this.paneContainer.getPanes().length > 1) || (this.pane.getItems().length > 1);
    }

    onDragStart(event){
        this.draggedTab = this.tabForElement(event.target)

        if(!this.draggedTab){
            return;
        }

        event.dataTransfer.setData('via-event', 'true');

        this.draggedTab.element.classList.add('is-dragging');
        this.draggedTab.destroyTooltip();

        const tabIndex = this.tabs.indexOf(this.draggedTab);
        event.dataTransfer.setData('sortable-index', tabIndex);

        const paneIndex = this.paneContainer.getPanes().indexOf(this.pane);
        event.dataTransfer.setData('from-pane-index', paneIndex);
        event.dataTransfer.setData('from-pane-id', this.pane.id);
        event.dataTransfer.setData('from-window-id', this.getWindowId());

        const item = this.pane.getItems()[this.tabs.indexOf(this.draggedTab)];

        if(!item){
            return;
        }

        let itemURI;

        if(typeof item.getURI === 'function'){
            itemURI = item.getURI() || '';
        }else if(typeof item.getPath === 'function'){
            itemURI = item.getPath() || '';
        }else if(typeof item.getUri === 'function'){
            itemURI = item.getUri() || '';
        }

        if(typeof item.getAllowedLocations === 'function'){
            for(const location of item.getAllowedLocations()){
                event.dataTransfer.setData(`allowed-location-${location}`, 'true');
            }
        }else{
            event.dataTransfer.setData('allow-all-locations', 'true');
        }

        if(itemURI){
            event.dataTransfer.setData('text/plain', itemURI);

            if(process.platform === 'darwin'){
                if(!this.uriHasProtocol(itemURI)){
                    itemURI = `file://${itemURI}`;
                }

                event.dataTransfer.setData('text/uri-list', itemURI);
            }

            if(item.isModified && item.isModified() && item.getText){
                event.dataTransfer.setData('has-unsaved-changes', 'true');
                event.dataTransfer.setData('modified-text', item.getText());
            }
        }
    }

    uriHasProtocol(uri){
        try {
            return require('url').parse(uri).protocol;
        }catch(error){
            return false;
        }
    }

    onDragLeave(event){
        for(const t of this.getTabs()){
            t.element.style.maxWidth = '';
        }

        this.removePlaceholder();
    }

    onDragEnd(event){
        if(!this.tabForElement(event.target)){
            return;
        }

        this.clearDropTarget();
    }

    onDragOver(event){
        if(!isViaEvent(event)){
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        event.preventDefault();
        const newDropTargetIndex = this.getDropTargetIndex(event);

        if(!newDropTargetIndex){
            return;
        }

        if(!itemIsAllowed(event, this.location)){
            return;
        }

        this.removeDropTargetClasses();

        let tab;
        const tabs = this.getTabs();
        const placeholder = this.getPlaceholder();

        if(!placeholder){
            return;
        }

        if(newDropTargetIndex < tabs.length){
            tab = tabs[newDropTargetIndex];
            tab.element.classList.add('is-drop-target');
            tab.element.parentElement.insertBefore(placeholder, tab.element);
        }else{
            tab = tabs[newDropTargetIndex - 1];

            if(tab){
                tab.element.classList.add('drop-target-is-after');
                const sibling = tab.element.nextSibling;

                if(sibling){
                    tab.element.parentElement.insertBefore(placeholder, sibling);
                }else{
                    tab.element.parentElement.appendChild(placeholder);
                }
            }
        }
    }

    onDropOnOtherWindow(fromPaneId, fromItemIndex){
        if(this.pane.id === fromPaneId){
            const itemToRemove = this.pane.getItems()[fromItemIndex];

            if(itemToRemove){
                this.pane.destroyItem(itemToRemove);
            }
        }

        this.clearDropTarget();
    }

    clearDropTarget(){
        if(this.draggedTab){
            this.draggedTab.element.classList.remove('is-dragging');
            this.draggedTab.updateTooltip();
        }

        this.draggedTab = null;
        this.removeDropTargetClasses();
        this.removePlaceholder();
    }

    onDrop(event){
        event.preventDefault();

        if(event.dataTransfer.getData('via-event') !== 'true'){
            return;
        }

        const fromWindowId  = parseInt(event.dataTransfer.getData('from-window-id'));
        const fromPaneId    = parseInt(event.dataTransfer.getData('from-pane-id'));
        const fromIndex     = parseInt(event.dataTransfer.getData('sortable-index'));
        const fromPaneIndex = parseInt(event.dataTransfer.getData('from-pane-index'));

        const hasUnsavedChanges = event.dataTransfer.getData('has-unsaved-changes') === 'true';
        const modifiedText = event.dataTransfer.getData('modified-text');

        const toIndex = this.getDropTargetIndex(event);
        const toPane = this.pane;

        this.clearDropTarget();

        if(!itemIsAllowed(event, this.location)){
            return;
        }

        if(fromWindowId === this.getWindowId()){
            let fromPane = this.paneContainer.getPanes()[fromPaneIndex];

            if(fromPane && fromPane.id !== fromPaneId){
                fromPane = Array.from(document.querySelectorAll('via-pane')).map(paneEl => paneEl.model).find(pane => pane.id === fromPaneId);
            }

            let item = fromPane.getItems()[fromIndex];

            if(item){
                this.moveItemBetweenPanes(fromPane, fromIndex, toPane, toIndex, item);
            }
        }else{
            const droppedURI = event.dataTransfer.getData('text/plain');

            via.workspace.open(droppedURI).then(item => {
                activePane = via.workspace.getActivePane();
                activeItemIndex = activePane.getItems().indexOf(item);
                this.moveItemBetweenPanes(activePane, activeItemIndex, toPane, toIndex, item);

                // if(hasUnsavedChanges && item.setText){
                //     item.setText(modifiedText);
                // }

                if(!isNaN(fromWindowId)){
                    let browserWindow = this.browserWindowForId(fromWindowId);

                    if(browserWindow){
                        browserWindow.webContents.send('tab:dropped', fromPaneId, fromIndex);
                    }
                }
            });
        }

        via.focus();
    }

    onMouseWheel(event){
        if(event.shiftKey){
            return;
        }

        this.wheelDelta = this.wheelDelta || 0;
        this.wheelDelta += event.wheelDeltaY;

        if(this.wheelDelta <= -this.tabScrollingThreshold){
            this.wheelDelta = 0;
            this.pane.activateNextItem();
        }else if(this.wheelDelta >= this.tabScrollingThreshold){
            this.wheelDelta = 0;
            this.pane.activatePreviousItem();
        }
    }


    onMouseDown(event){
        let tab = this.tabForElement(event.target);

        if(!tab){
            return;
        }

        if(event.which === 3 || (event.which === 1 && event.ctrlKey === true)){
            if(this.rightClickedTab){
                this.rightClickedTab.element.classList.remove('right-clicked');
            }

            this.rightClickedTab = tab;
            this.rightClickedTab.element.classList.add('right-clicked');
            event.preventDefault();
        }else if(event.which === 1 && !event.target.classList.contains('close-icon')){
            setImmediate(() => {
                this.pane.activateItem(tab.item);

                if(!this.pane.isDestroyed()){
                    this.pane.activate();
                }
            });
        }else if(event.which === 2){
            this.pane.destroyItem(tab.item);
            event.preventDefault();
        }
    }

    onClick(event){
        const tab = this.tabForElement(event.target);

        if(!tab){
            return;
        }

        event.preventDefault();

        if(event.which === 3 || (event.which === 1 && event.ctrlKey === true)){
            return;
        }else if(event.which === 1 && !event.target.classList.contains('close-icon')){
            this.pane.activateItem(tab.item);

            if(!this.pane.isDestroyed()){
                this.pane.activate();
            }
        }else if(event.which === 2){
            this.pane.destroyItem(tab.item);
        }
    }

    onDoubleClick(event){
        const tab = this.tabForElement(event.target);

        if(tab){
            if(tab.item.terminatePendingState){
                tab.item.terminatePendingState();
            }
        }else if(event.target === this.element){
            via.commands.dispatch(this.element, 'application:new-file');
            event.preventDefault();
        }
    }

    updateTabScrollingThreshold(){
        this.tabScrollingThreshold = via.config.get('tabs.tabScrollingThreshold');
    }

    updateTabScrolling(value){
        if(value === 'platform'){
            this.tabScrolling = (process.platform === 'linux');
        }else{
            this.tabScrolling = value;
        }

        this.tabScrollingThreshold = via.config.get('tabs.tabScrollingThreshold');

        if(this.tabScrolling){
            this.element.addEventListener('mousewheel', this.onMouseWheel.bind(this));
        }else{
            this.element.removeEventListener('mousewheel', this.onMouseWheel.bind(this));
        }
    }

    browserWindowForId(id){
        BrowserWindow = BrowserWindow || require('electron').remote.BrowserWindow;
        return BrowserWindow.fromId(id);
    }

    moveItemBetweenPanes(fromPane, fromIndex, toPane, toIndex, item){
        try {
            if(toPane === fromPane){
                if(fromIndex < toIndex){
                    toIndex--;
                }

                toPane.moveItem(item, toIndex);
            }else{
                this.isItemMovingBetweenPanes = true;
                fromPane.moveItemToPane(item, toPane, toIndex--);
            }

            toPane.activateItem(item);
            toPane.activate();
        } finally {
            this.isItemMovingBetweenPanes = false;
        }
    }

    removeDropTargetClasses(){
        const workspaceElement = via.workspace.getElement();

        for(const dropTarget of workspaceElement.querySelectorAll('.tab-bar .is-drop-target')){
            dropTarget.classList.remove('is-drop-target');
        }

        for(const dropTarget of workspaceElement.querySelectorAll('.tab-bar .drop-target-is-after')){
            dropTarget.classList.remove('drop-target-is-after');
        }
    }

    getDropTargetIndex(event){
        const target = event.target;

        if(this.isPlaceholder(target)){
            return;
        }

        const tabs = this.getTabs();
        const tab = this.tabForElement(target) || tabs[tabs.length - 1];

        if(!tab){
            return 0;
        }

        const {left, width} = tab.element.getBoundingClientRect();
        const elementCenter = left + width / 2;
        const elementIndex = tabs.indexOf(tab);

        if(event.pageX < elementCenter){
            return elementIndex;
        }else{
            return elementIndex + 1;
        }
    }

    getPlaceholder(){
        if(this.placeholderEl){
            return this.placeholderEl;
        }

        this.placeholderEl = document.createElement('li');
        this.placeholderEl.classList.add('placeholder');
        this.placeholderEl;
    }

    removePlaceholder(){
        if(this.placeholderEl){
            this.placeholderEl.remove();
        }

        this.placeholderEl = null;
    }

    isPlaceholder(element){
        return element.classList.contains('placeholder');
    }

    onMouseEnter(){
        for(let tab of this.getTabs()){
            let {width} = tab.element.getBoundingClientRect();
            tab.element.style.maxWidth = width.toFixed(2) + 'px';
        }
    }

    onMouseLeave(){
        for(let tab of this.getTabs()){
            tab.element.style.maxWidth = '';
        }
    }

    tabForElement(element){
        let currentElement = element;

        while(currentElement){
            let tab = this.tabsByElement.get(currentElement);

            if(tab){
                return tab;
            }else{
                currentElement = currentElement.parentElement;
            }
        }
    }
}


const isViaEvent = event => {
    for(const item of event.dataTransfer.items){
        if(item.type === 'via-event'){
            return true;
        }
    }

    return false;
};

const itemIsAllowed = (event, location) => {
    for(const item of event.dataTransfer.items){
        if(item.type === 'allow-all-locations' || item.type === `allowed-location-${location}`){
            return true;
        }
    }

    return false;
};
