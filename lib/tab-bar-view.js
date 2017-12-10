const {Disposable, CompositeDisposable} = require('via');
const TabView = require('./tab-view');

module.exports = class TabBarView {
    constructor(pane, location){
        this.pane = pane;
        this.location = location;
        this.element = document.createElement('ul');
        this.element.classList.add("tab-bar");
        this.element.classList.add("inset-panel");
        this.element.setAttribute('is', 'via-tabs');
        this.element.setAttribute("tabindex", -1);
        this.element.setAttribute("location", this.location);

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

        this.element.addEventListener("mouseenter", this.onMouseEnter.bind(this));
        this.element.addEventListener("mouseleave", this.onMouseLeave.bind(this));
        // this.element.addEventListener("dragstart", this.onDragStart.bind(this));
        // this.element.addEventListener("dragend", this.onDragEnd.bind(this));
        // this.element.addEventListener("dragleave", this.onDragLeave.bind(this));
        // this.element.addEventListener("dragover", this.onDragOver.bind(this));
        // this.element.addEventListener("drop", this.onDrop.bind(this));

        this.paneContainer = this.pane.getContainer();
        this.pane.getItems().forEach(item => this.addTabForItem(item));

        this.subscriptions.add(this.pane.onDidDestroy(() => this.destroy()));
        this.subscriptions.add(this.pane.onDidAddItem(({item, index}) => this.addTabForItem(item, index)));
        this.subscriptions.add(this.pane.onDidMoveItem(({item, newIndex}) => this.moveItemTabToIndex(item, newIndex)));
        this.subscriptions.add(this.pane.onDidRemoveItem(({item}) => this.removeTabForItem(item)));
        this.subscriptions.add(this.pane.onDidChangeActiveItem(item => this.updateActiveTab()));
        // this.subscriptions.add(via.config.observe('tabs.tabScrolling', this.updateTabScrolling.bind(this)));
        // this.subscriptions.add(via.config.observe('tabs.tabScrollingThreshold', () => this.updateTabScrollingThreshold()));
        this.subscriptions.add(via.config.observe('tabs.alwaysShowTabBar', () => this.updateTabBarVisibility()));

        this.updateActiveTab();

        this.element.addEventListener("mousedown", this.onMouseDown.bind(this));

        // this.onDropOnOtherWindow = this.onDropOnOtherWindow.bind(this);
        // ipcRenderer.on('tab:dropped', this.onDropOnOtherWindow);
    }

    destroy(){
        // ipcRenderer.removeListener('tab:dropped', this.onDropOnOtherWindow);
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

    shouldAllowDrag(){
        return false;
    }

    updateTabBarVisibility(){
        // if(this.pane.getItems().length < 2){
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

  //   onDragLeave: (event) ->
  //   this.removePlaceholder()
  //
  // onDragEnd: (event) ->
  //   return unless this.tabForElement(event.target)
  //
  //   this.clearDropTarget()
  //
  // onDragOver: (event) ->
  //   unless isAtomEvent(event)
  //     event.preventDefault()
  //     event.stopPropagation()
  //     return
  //
  //   event.preventDefault()
  //   newDropTargetIndex = this.getDropTargetIndex(event)
  //   return unless newDropTargetIndex?
  //   return unless itemIsAllowed(event, this.location)
  //
  //   this.removeDropTargetClasses()
  //
  //   tabs = this.getTabs()
  //   placeholder = this.getPlaceholder()
  //   return unless placeholder?
  //
  //   if newDropTargetIndex < tabs.length
  //     tab = tabs[newDropTargetIndex]
  //     tab.element.classList.add 'is-drop-target'
  //     tab.element.parentElement.insertBefore(placeholder, tab.element)
  //   else
  //     if tab = tabs[newDropTargetIndex - 1]
  //       tab.element.classList.add 'drop-target-is-after'
  //       if sibling = tab.element.nextSibling
  //         tab.element.parentElement.insertBefore(placeholder, sibling)
  //       else
  //         tab.element.parentElement.appendChild(placeholder)
  //
  // onDropOnOtherWindow: (fromPaneId, fromItemIndex) ->
  //   if this.pane.id === fromPaneId
  //     if itemToRemove = this.pane.getItems()[fromItemIndex]
  //       this.pane.destroyItem(itemToRemove)
  //
  //   this.clearDropTarget()
  //
  // clearDropTarget: ->
  //   this.draggedTab?.element.classList.remove('is-dragging')
  //   this.draggedTab?.updateTooltip()
  //   this.draggedTab = null
  //   this.removeDropTargetClasses()
  //   this.removePlaceholder()
  //
  // onDrop: (event) ->
  //   event.preventDefault()
  //
  //   return unless event.dataTransfer.getData('atom-event') === 'true'
  //
  //   fromWindowId  = parseInt(event.dataTransfer.getData('from-window-id'))
  //   fromPaneId    = parseInt(event.dataTransfer.getData('from-pane-id'))
  //   fromIndex     = parseInt(event.dataTransfer.getData('sortable-index'))
  //   fromPaneIndex = parseInt(event.dataTransfer.getData('from-pane-index'))
  //
  //   hasUnsavedChanges = event.dataTransfer.getData('has-unsaved-changes') === 'true'
  //   modifiedText = event.dataTransfer.getData('modified-text')
  //
  //   toIndex = this.getDropTargetIndex(event)
  //   toPane = this.pane
  //
  //   this.clearDropTarget()
  //
  //   return unless itemIsAllowed(event, this.location)
  //
  //   if fromWindowId === this.getWindowId()
  //     fromPane = this.paneContainer.getPanes()[fromPaneIndex]
  //     if fromPane?.id isnt fromPaneId
  //       # If dragging from a different pane container, we have to be more
  //       # exhaustive in our search.
  //       fromPane = Array.from document.querySelectorAll('atom-pane')
  //         .map (paneEl) -> paneEl.model
  //         .find (pane) -> pane.id === fromPaneId
  //     item = fromPane.getItems()[fromIndex]
  //     this.moveItemBetweenPanes(fromPane, fromIndex, toPane, toIndex, item) if item?
  //   else
  //     droppedURI = event.dataTransfer.getData('text/plain')
  //     atom.workspace.open(droppedURI).then (item) =>
  //       # Move the item from the pane it was opened on to the target pane
  //       # where it was dropped onto
  //       activePane = atom.workspace.getActivePane()
  //       activeItemIndex = activePane.getItems().indexOf(item)
  //       this.moveItemBetweenPanes(activePane, activeItemIndex, toPane, toIndex, item)
  //       item.setText?(modifiedText) if hasUnsavedChanges
  //
  //       if !isNaN(fromWindowId)
  //         # Let the window where the drag started know that the tab was dropped
  //         browserWindow = this.browserWindowForId(fromWindowId)
  //         browserWindow?.webContents.send('tab:dropped', fromPaneId, fromIndex)
  //
  //     atom.focus()
  //
  // onMouseWheel: (event) ->
  //   return if event.shiftKey
  //
  //   this.wheelDelta ?= 0
  //   this.wheelDelta += event.wheelDeltaY
  //
  //   if this.wheelDelta <= -this.tabScrollingThreshold
  //     this.wheelDelta = 0
  //     this.pane.activateNextItem()
  //   else if this.wheelDelta >= this.tabScrollingThreshold
  //     this.wheelDelta = 0
  //     this.pane.activatePreviousItem()
  //

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
