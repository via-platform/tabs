const _ = require('underscore-plus');
const {Disposable, CompositeDisposable} = require('via');
const Layout = require('./layout');
const uuid = require('uuid/v1');

const ColorGroups = {
    red: 'Red',
    orange: 'Orange',
    yellow: 'Yellow',
    green: 'Green',
    teal: 'Teal',
    blue: 'Blue',
    purple: 'Purple'
};

module.exports = class TabView {
    constructor(options = {}){
        const {didClickCloseIcon, location} = options;
        this.manager = options.manager;
        this.item = options.item;
        this.pane = options.pane;
        this.tabs = options.tabs;
        this.uuid = `tab-${uuid()}`;
        this.color = this.manager.getGroupForItem(this.item);

        this.element = document.createElement('li');
        this.element.setAttribute('is', 'tabs-tab');
        this.element.classList.add('tab', 'sortable', this.uuid);

        this.itemTitle = document.createElement('div');
        this.itemTitle.classList.add('title');
        this.element.appendChild(this.itemTitle);

        const closeIcon = document.createElement('div');
        closeIcon.classList.add('close-icon');
        closeIcon.onclick = didClickCloseIcon;
        this.element.appendChild(closeIcon);

        this.linkIcon = document.createElement('div');
        this.linkIcon.classList.add('link-icon');
        this.linkIcon.onclick = this.didClickLinkIcon.bind(this);
        this.element.appendChild(this.linkIcon);

        this.linkColor = document.createElement('div');
        this.linkColor.classList.add('link-color');
        this.linkIcon.appendChild(this.linkColor);

        this.subscriptions = new CompositeDisposable();

        this.handleEvents();
        this.updateDataAttributes();
        this.updateTitle();

        this.element.ondrag = e => Layout.drag(e);
        this.element.ondragend = e => Layout.end(e);

        this.element.pane = this.pane;
        this.element.item = this.item;
        this.element.itemTitle = this.itemTitle;

        this.linkable = _.isFunction(this.item.onDidChangeMarket) && _.isFunction(this.item.changeMarket) && _.isFunction(this.item.getMarket);
        this.updateLinkMenu();
    }

    link(color = ''){
        this.color = color;
        this.manager.addItemToGroup(this.item, this.color);
        this.updateLinkMenu();
    }

    updateLinkMenu(){
        const itemsBySelector = {};
        const items = [
            {type: 'separator'},
            {label: this.linkable ? 'Select A Group' : 'Cannot Group Item', enabled: false}
        ];

        if(this.linkable){
            this.linkColor.classList.remove(...Object.keys(ColorGroups));
            this.linkColor.classList.remove('unlinked');

            if(this.color){
                this.linkColor.classList.add(this.color);
            }else{
                this.linkColor.classList.add('unlinked');
            }

            items.push({
                label: 'No Group',
                click: () => this.link(),
                type: 'radio',
                checked: !this.color
            });

            for(const [key, value] of Object.entries(ColorGroups)){
                items.push({
                    label: value,
                    click: () => this.link(key),
                    type: 'radio',
                    checked: this.color === key
                });
            }
        }

        items.push({type: 'separator'});
        itemsBySelector[`.${this.uuid} .link-icon`] = items;

        if(this.menu) this.menu.dispose();
        this.menu = via.contextMenu.add(itemsBySelector);
    }

    didClickLinkIcon(e){
        e.preventDefault();
        e.stopPropagation();
        this.linkIcon.dispatchEvent(new CustomEvent('contextmenu', {bubbles: true}));
    }

    handleEvents(){
        this.subscriptions.add(this.pane.onDidDestroy(() => this.destroy()));

        if(_.isFunction(this.item.onDidChangeTitle)){
            this.subscriptions.add(this.item.onDidChangeTitle(this.updateTitle.bind(this)));
        }

        if(_.isFunction(this.item.onDidChangeMarket)){
            this.subscriptions.add(this.item.onDidChangeMarket(this.updateMarket.bind(this)));
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

        if(this.menu){
            this.menu.dispose();
        }

        this.element.remove();
    }

    updateDataAttributes(){
        let itemClass = this.item.constructor && this.item.constructor.name;

        if(itemClass){
            this.element.dataset.type = itemClass;
        }else{
            delete this.element.dataset.type;
        }
    }

    updateMarket(market){
        if(this.color){
            this.manager.groupChangeMarket(this.color, market);
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
