const {CompositeDisposable, Disposable} = require('via');
const TabBarView = require('./tab-bar-view');
// const DesktopTabBarView = require('./desktop-tab-bar-view');
const _ = require('underscore-plus');

module.exports = class Tabs {

    static activate(state){
        let keyBindSource = 'tabs package';
        let configKey = 'tabs.enableMruTabSwitching';

        this.subscriptions = new CompositeDisposable();
        this.tabBarViews = [];

        this.updateTraversalKeybinds = () => {
            let bindings = via.keymaps.findKeyBindings({target: document.body, keystrokes: 'ctrl-tab'});

            if(bindings.length > 1 && bindings[0].source !== keyBindSource){
                return;
            }

            bindings = via.keymaps.findKeyBindings({target: document.body, keystrokes: 'ctrl-shift-tab'});

            if(bindings.length > 1 && bindings[0].source !== keyBindSource){
                return;
            }

            if(via.config.get(configKey)){
                via.keymaps.removeBindingsFromSource(keyBindSource);
            }else{
                let disabledBindings = {
                    'body': {
                    'ctrl-tab': 'pane:show-next-item',
                    'ctrl-tab ^ctrl': 'unset!',
                    'ctrl-shift-tab': 'pane:show-previous-item',
                    'ctrl-shift-tab ^ctrl': 'unset!'
                    }
                };

                via.keymaps.add(keyBindSource, disabledBindings, 0);
            }
        };

        this.subscriptions.add(via.config.observe(configKey, () => this.updateTraversalKeybinds()));

        if(via.keymaps.onDidLoadUserKeymap){
            this.subscriptions.add(via.keymaps.onDidLoadUserKeymap(() => this.updateTraversalKeybinds()));
        }

        this.subscriptions.add(via.commands.add('via-desktop', {
            'tabs:close-all-tabs': () => {
                //TODO close all tabs in the main workspace
                // this.tabBar.closeAllTabs()
            }
        }));

        // this.desktopTabs = via.desktop.addFooterPanel({item: new DesktopTabBarView(), priority: 1, className: 'desktop-tabs-panel'});


        via.desktop.getContainers().forEach(container => {
            this.subscriptions.add(container.observePanes(pane => {
                let tabBarView = new TabBarView(pane, location);

                let paneElement = pane.getElement();
                paneElement.insertBefore(tabBarView.element, paneElement.firstChild);

                this.tabBarViews.push(tabBarView);
                pane.onDidDestroy(() => _.remove(this.tabBarViews, tabBarView));
            }));
        });
    }

    static deactivate(){
        // if(this.desktopTabs){
        //     this.desktopTabs.destroy();
        //     this.desktopTabs = null;
        // }

        for(let view of this.tabBarViews){
            view.destroy();
        }

        this.subscriptions.dispose();
        this.subscriptions = null;
    }
}
