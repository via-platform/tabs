const path = require('path');
const {Disposable, CompositeDisposable} = require('via');

module.exports = class DesktopTabView {
    constructor(options = {}){
        let {didClickCloseIcon, location} = options;
        this.workspace = options.workspace;
        this.tabs = options.tabs;

        if(typeof this.workspace.getPath === 'function'){
            this.path = this.workspace.getPath();
        }

        this.element = document.createElement('li');
        this.element.setAttribute('is', 'tabs-tab');
        this.element.classList.add('tab', 'sortable');

        this.workspaceTitle = document.createElement('div');
        this.workspaceTitle.classList.add('title');
        this.element.appendChild(this.workspaceTitle);

        let closeIcon = document.createElement('div');
        closeIcon.classList.add('close-icon');
        closeIcon.onclick = didClickCloseIcon;
        this.element.appendChild(closeIcon);

        this.subscriptions = new CompositeDisposable();

        this.handleEvents();
        this.updateDataAttributes();
        this.updateTitle();
        // this.updateModifiedStatus();

        // this.element.ondrag = e => layout.drag(e);
        // this.element.ondragend = e => layout.end(e);

        this.element.workspace = this.workspace;
        this.element.workspaceTitle = this.workspaceTitle;
        this.element.path = this.path;
    }

    handleEvents(){
        let titleChangedHandler = () => this.updateTitle();

        // this.subscriptions.add(this.pane.onDidDestroy(() => this.destroy()));

        if(typeof this.workspace.onDidChangeTitle === 'function'){
            let onDidChangeTitleDisposable = this.workspace.onDidChangeTitle(titleChangedHandler);

            if(Disposable.isDisposable(onDidChangeTitleDisposable)){
                this.subscriptions.add(onDidChangeTitleDisposable);
            }else{
                console.warn("::onDidChangeTitle does not return a valid Disposable!", this.workspace);
            }
        }

        let pathChangedHandler = path => {
            this.path = path;
            this.updateDataAttributes();
            this.updateTitle();
        };
    }

    destroy(){
        if(this.subscriptions){
            this.subscriptions.dispose();
        }

        if(this.mouseEnterSubscription){
            this.mouseEnterSubscription.dispose();
        }

        if(this.repoSubscriptions){
            this.repoSubscriptions.dispose();
        }

        this.element.remove();
    }

    updateDataAttributes(){
        if(this.path){
            this.workspaceTitle.dataset.name = path.basename(this.path);
            this.workspaceTitle.dataset.path = this.path;
        }else{
            delete this.workspaceTitle.dataset.name;
            delete this.workspaceTitle.dataset.path;
        }

        let workspaceClass = this.workspace.constructor && this.workspace.constructor.name;

        if(workspaceClass){
            this.element.dataset.type = workspaceClass;
        }else{
            delete this.element.dataset.type;
        }
    }

    updateTitle({updateSiblings, useLongTitle} = {}){
        if(this.updatingTitle){
            return;
        }

        this.updatingTitle = true;

        let title;

        if(updateSiblings === false){
            title = this.workspace.getTitle();

            if(useLongTitle){
                title = this.workspace.getLongTitle ? this.workspace.getLongTitle() : title;
            }

            this.workspaceTitle.textContent = title;
        }else{
            title = this.workspace.getTitle();
            useLongTitle = false;

            for(let tab of this.tabs){
                if(tab !== this && tab.workspace.getTitle() === title){
                    tab.updateTitle({updateSiblings: false, useLongTitle: true});
                    useLongTitle = true;
                }

                if(useLongTitle){
                    title = this.workspace.getLongTitle ? this.workspace.getLongTitle() : title;
                }
            }

            this.workspaceTitle.textContent = title;
        }

        this.updatingTitle = false;
    }
}
