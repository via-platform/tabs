const path = require('path');
const {Disposable, CompositeDisposable} = require('via');
const layout = require('./layout');

module.exports = class TabView {
    constructor(options = {}){
        let {didClickCloseIcon, location} = options;
        this.item = options.item;
        this.pane = options.pane;
        this.tabs = options.tabs;

        if(typeof this.item.getPath === 'function'){
            this.path = this.item.getPath();
        }

        this.element = document.createElement('li');
        this.element.setAttribute('is', 'tabs-tab');
        this.element.classList.add('tab', 'sortable');

        this.itemTitle = document.createElement('div');
        this.itemTitle.classList.add('title');
        this.element.appendChild(this.itemTitle);

        let closeIcon = document.createElement('div');
        closeIcon.classList.add('close-icon');
        closeIcon.onclick = didClickCloseIcon;
        this.element.appendChild(closeIcon);

        this.subscriptions = new CompositeDisposable();

        this.handleEvents();
        this.updateDataAttributes();
        this.updateTitle();
        this.setupTooltip();

        this.element.ondrag = e => layout.drag(e);
        this.element.ondragend = e => layout.end(e);

        this.element.pane = this.pane;
        this.element.item = this.item;
        this.element.itemTitle = this.itemTitle;
        this.element.path = this.path;
    }

    handleEvents(){
        let titleChangedHandler = () => this.updateTitle();

        this.subscriptions.add(this.pane.onDidDestroy(() => this.destroy()));

        if(typeof this.item.onDidChangeTitle === 'function'){
            let onDidChangeTitleDisposable = this.item.onDidChangeTitle(titleChangedHandler);

            if(Disposable.isDisposable(onDidChangeTitleDisposable)){
                this.subscriptions.add(onDidChangeTitleDisposable);
            }else{
                console.warn("::onDidChangeTitle does not return a valid Disposable!", this.item);
            }
        }

        let pathChangedHandler = path => {
            this.path = path;
            this.updateDataAttributes();
            this.updateTitle();
            this.updateTooltip();
        };
    }

    setupTooltip(){
        // Defer creating the tooltip until the tab === moused over
        let onMouseEnter = () => {
            this.mouseEnterSubscription.dispose();
            this.hasBeenMousedOver = true;
            this.updateTooltip();

            // Trigger again so the tooltip shows
            this.element.dispatchEvent(new CustomEvent('mouseenter', {bubbles: true}));
        };

        this.mouseEnterSubscription = {
            dispose: () => {
                this.element.removeEventListener('mouseenter', onMouseEnter);
                this.mouseEnterSubscription = null;
            }
        };

        this.element.addEventListener('mouseenter', onMouseEnter);
    }

    updateTooltip(){
        if(!this.hasBeenMousedOver){
            return;
        }

        this.destroyTooltip();

        if(this.path){
            this.tooltip = via.tooltips.add(this.element, {
                title: this.path,
                html: false,
                delay: {
                    show: 1000,
                    hide: 100
                },
                placement: 'bottom'
            });
        }
    }

    destroyTooltip(){
        if(this.hasBeenMousedOver && this.tooltip){
            this.tooltip.dispose();
        }
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

        this.destroyTooltip();
        this.element.remove();
    }

    updateDataAttributes(){
        if(this.path){
            this.itemTitle.dataset.name = path.basename(this.path);
            this.itemTitle.dataset.path = this.path;
        }else{
            delete this.itemTitle.dataset.name;
            delete this.itemTitle.dataset.path;
        }

        let itemClass = this.item.constructor && this.item.constructor.name;

        if(itemClass){
            this.element.dataset.type = itemClass;
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
            title = this.item.getTitle();

            if(useLongTitle){
                title = this.item.getLongTitle ? this.item.getLongTitle() : title;
            }

            this.itemTitle.textContent = title;
        }else{
            title = this.item.getTitle();
            useLongTitle = false;

            for(let tab of this.tabs){
                if(tab !== this && tab.item.getTitle() === title){
                    tab.updateTitle({updateSiblings: false, useLongTitle: true});
                    useLongTitle = true;
                }

                if(useLongTitle){
                    title = this.item.getLongTitle ? this.item.getLongTitle() : title;
                }
            }

            this.itemTitle.textContent = title;
        }

        this.updatingTitle = false;
    }
}
