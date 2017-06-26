const {CompositeDisposable, Disposable} = require('via');
// const FileIcons = require('./file-icons');
const TabBarView = require('./tab-bar-view');
const _ = require('underscore-plus');

module.exports = class Tabs {
    static activate(state){
        this.subscriptions = new CompositeDisposable();
        let keyBindSource = 'tabs package';

        let container = via.workspace.getCenter();
        this.panes = container.getPanes();

        if(this.panes.length > 1){
            throw new Error('There should only be one center pane.');
        }

        this.tabBar = new TabBarView();
        this.attachTabBar();

        this.subscriptions.add(via.commands.add('via-workspace', {
            'tabs:close-all-tabs': () => this.tabBar.closeAllTabs()
        }));
    }

    static deactivate(){
        if(this.tabBarPanel){
            this.tabBarPanel.destroy();
            this.tabBarPanel = null;
        }

        if(this.tabBar){
            this.tabBar.destroy();
            this.tabBar = null;
        }

        if(via.__workspaceView){
            delete via.__workspaceView.titleBar;
        }

        this.subscriptions.dispose();
        this.subscriptions = null;
    }

    static attachTabBar(){
        if(this.tabBarPanel){
            this.tabBarPanel.destroy();
        }

        this.tabBarPanel = via.workspace.addHeaderPanel({item: this.tabBar, priority: 1, className: 'tab-bar-panel'});
    }
}
