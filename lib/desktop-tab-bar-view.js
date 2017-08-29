const {Disposable, CompositeDisposable} = require('via');
const DesktopTabView = require('./desktop-tab-view');

module.exports = class DesktopTabBarView {
    constructor(pane, location){
        this.element = document.createElement('ul');
        this.element.classList.add("list-inline");
        this.element.classList.add("tab-bar");
        this.element.classList.add("inset-panel");
        this.element.setAttribute('is', 'via-tabs');
        this.element.setAttribute("tabindex", -1);
        this.element.setAttribute("location", this.location);

        this.tabs = [];
        this.tabsByElement = new WeakMap();
        this.subscriptions = new CompositeDisposable();
        this.visible = false;

        this.subscriptions.add(via.commands.add(via.desktop.getElement(), {
            'tabs:close-tab': () => this.closeTab(this.getActiveTab()),
            'tabs:close-other-tabs': () => this.closeOtherTabs(this.getActiveTab()),
            'tabs:close-tabs-to-right': () => this.closeTabsToRight(this.getActiveTab()),
            'tabs:close-tabs-to-left': () => this.closeTabsToLeft(this.getActiveTab()),
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

        // this.element.addEventListener("mouseenter", this.onMouseEnter.bind(this));
        // this.element.addEventListener("mouseleave", this.onMouseLeave.bind(this));
        // this.element.addEventListener("dragstart", this.onDragStart.bind(this));
        // this.element.addEventListener("dragend", this.onDragEnd.bind(this));
        // this.element.addEventListener("dragleave", this.onDragLeave.bind(this));
        // this.element.addEventListener("dragover", this.onDragOver.bind(this));
        // this.element.addEventListener("drop", this.onDrop.bind(this));

        // this.subscriptions.add(via.desktop.onDidDestroy(() => this.destroy()));
        this.subscriptions.add(via.desktop.getCenter().observeWorkspaces((workspace) => this.addTabForWorkspace(workspace)));
        this.subscriptions.add(via.desktop.onDidMoveWorkspace(({workspace, newIndex}) => this.moveWorkspaceTabToIndex(workspace, newIndex)));
        this.subscriptions.add(via.desktop.onDidDestroyWorkspace(({workspace}) => this.removeTabForWorkspace(workspace)));
        this.subscriptions.add(via.desktop.onDidChangeActiveWorkspace(workspace => this.updateActiveTab()));
        // this.subscriptions.add(via.config.observe('tabs.tabScrolling', this.updateTabScrolling.bind(this)));
        // this.subscriptions.add(via.config.observe('tabs.tabScrollingThreshold', () => this.updateTabScrollingThreshold()));
        this.subscriptions.add(via.config.observe('tabs.alwaysShowTabBar', () => this.updateTabBarVisibility()));

        this.updateActiveTab();

        this.element.addEventListener("mousedown", this.onMouseDown.bind(this));
        // this.element.addEventListener("dblclick", this.onDoubleClick.bind(this));

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

    addTabForWorkspace(workspace, index){
        let tabView = new DesktopTabView({
            workspace: workspace,
            tabs: this.tabs,
            didClickCloseIcon: () => this.closeTab(tabView),
            location: this.location
        });

        if(this.isWorkspaceMovingBetweenPanes){
            tabView.terminatePendingState();
        }

        this.tabsByElement.set(tabView.element, tabView);
        this.insertTabAtIndex(tabView, index);

        if(via.config.get('tabs.addNewTabsAtEnd') && !this.isWorkspaceMovingBetweenPanes){
            via.desktop.moveWorkspace(workspace, via.desktop.getWorkspaces().length - 1);
        }

        this.updateTabBarVisibility();
    }

    moveWorkspaceTabToIndex(workspace, index){
        let tabIndex = this.tabs.findIndex(t => t.workspace === workspace);

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

    removeTabForWorkspace(workspace){
        let tabIndex = this.tabs.findIndex(t => t.workspace === workspace);

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
        this.element.classList.remove('hidden');
        if(via.desktop.getCenter().getWorkspaces().length < 2){ //!via.config.get('tabs.alwaysShowTabBar') &&  && !this.shouldAllowDrag()
            // this.element.classList.add('hidden');
        }else{
        }
    }

    getTabs(){
        return this.tabs.slice();
    }

    tabAtIndex(index){
        return this.tabs[index];
    }

    tabForWorkspace(workspace){
        return this.tabs.find(t => t.workspace === workspace);
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
        return this.tabForWorkspace(via.desktop.getCenter().getActiveWorkspace());
    }

    updateActiveTab(){
        console.log('Updating active tab');
        console.log(via.desktop.getCenter().getActiveWorkspace());
        console.log(this.tabForWorkspace(via.desktop.getCenter().getActiveWorkspace()));
        return this.setActiveTab(this.tabForWorkspace(via.desktop.getCenter().getActiveWorkspace()));
    }

    closeTab(tab){
        tab = tab || this.rightClickedTab;

        if(tab){
            via.desktop.destroyWorkspace(tab.workspace);
        }
    }

    openInNewWindow(tab){
        tab = tab || this.rightClickedTab;
        let workspace = tab ? tab.workspace : undefined;

        if(!workspace){
            return;
        }

        let workspaceURI;

        if(typeof workspace.getURI === 'function'){
            workspaceURI = workspace.getURI();
        }else if(typeof workspace.getPath === 'function'){
            workspaceURI = workspace.getPath();
        }else if(typeof workspace.getUri === 'function'){
            workspaceURI = workspace.getUri();
        }

        if(!workspaceURI){
            return;
        }

        this.closeTab(tab);
        let pathsToOpen = [via.project.getPaths(), workspaceURI].reduce((a, b) => a.concat(b), []);
        via.open({pathsToOpen: pathsToOpen, newWindow: true, devMode: via.devMode, safeMode: via.safeMode});
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
  //   return unless workspaceIsAllowed(event, this.location)
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
  // onDropOnOtherWindow: (fromPaneId, fromWorkspaceIndex) ->
  //   if via.desktop.id === fromPaneId
  //     if workspaceToRemove = via.desktop.getWorkspaces()[fromWorkspaceIndex]
  //       via.desktop.destroyWorkspace(workspaceToRemove)
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
  //   toPane = via.desktop
  //
  //   this.clearDropTarget()
  //
  //   return unless workspaceIsAllowed(event, this.location)
  //
  //   if fromWindowId === this.getWindowId()
  //     fromPane = via.desktopContainer.getPanes()[fromPaneIndex]
  //     if fromPane?.id isnt fromPaneId
  //       # If dragging from a different pane container, we have to be more
  //       # exhaustive in our search.
  //       fromPane = Array.from document.querySelectorAll('atom-pane')
  //         .map (paneEl) -> paneEl.model
  //         .find (pane) -> pane.id === fromPaneId
  //     workspace = fromPane.getWorkspaces()[fromIndex]
  //     this.moveWorkspaceBetweenPanes(fromPane, fromIndex, toPane, toIndex, workspace) if workspace?
  //   else
  //     droppedURI = event.dataTransfer.getData('text/plain')
  //     atom.workspace.open(droppedURI).then (workspace) =>
  //       # Move the workspace from the pane it was opened on to the target pane
  //       # where it was dropped onto
  //       activePane = atom.workspace.getActivePane()
  //       activeWorkspaceIndex = activePane.getWorkspaces().indexOf(workspace)
  //       this.moveWorkspaceBetweenPanes(activePane, activeWorkspaceIndex, toPane, toIndex, workspace)
  //       workspace.setText?(modifiedText) if hasUnsavedChanges
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
  //     via.desktop.activateNextWorkspace()
  //   else if this.wheelDelta >= this.tabScrollingThreshold
  //     this.wheelDelta = 0
  //     via.desktop.activatePreviousWorkspace()
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
                via.desktop.activateWorkspace(tab.workspace);

                // if(!via.desktop.isDestroyed()){
                //     via.desktop.activate();
                // }
            });
        }else if(event.which === 2){
            via.desktop.destroyWorkspace(tab.workspace);
            event.preventDefault();
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
