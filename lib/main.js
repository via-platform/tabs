const {CompositeDisposable, Disposable} = require('via');
const TabBarView = require('./tab-bar-view');
const layout = require('./layout');
const _ = require('underscore-plus');

class Tabs {
    activate(state){
        let keyBindSource = 'tabs package';
        let configKey = 'tabs.enableMruTabSwitching';

        this.subscriptions = new CompositeDisposable();
        this.tabBarViews = [];
        layout.activate();

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

        this.subscriptions.add(via.commands.add('via-workspace', {
            'tabs:close-all-tabs': () => {
                for(const tabBar of this.tabBarViews.reverse()){
                    tabBar.closeAllTabs();
                }
            }
        }));

        this.subscriptions.add(via.workspace.center.observePanes(pane => {
            const tabBarView = new TabBarView({manager: this, pane, location});
            const paneElement = pane.getElement();
            paneElement.insertBefore(tabBarView.element, paneElement.firstChild);

            this.tabBarViews.push(tabBarView);
            pane.onDidDestroy(() => _.remove(this.tabBarViews, tabBarView));
        }));
    }

    deactivate(){
        layout.deactivate();

        for(const view of this.tabBarViews){
            view.destroy();
        }

        this.subscriptions.dispose();
        this.subscriptions = null;
    }
}

module.exports = new Tabs();