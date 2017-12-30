const itemIsAllowedInPane = (item, pane) => {
    const allowedLocations = item.getAllowedLocations && item.getAllowedLocations();

    if(!allowedLocations){
        return true;
    }

    const container = pane.getContainer();
    const location = container.getLocation ? container.getLocation() : 'center';

    return allowedLocations.includes(location);
};

class Layout {
    constructor(){
        this.test = {};
    }

    activate(){
        this.view = document.createElement('div');
        via.workspace.getElement().appendChild(this.view);
        this.view.classList.add('tabs-layout-overlay');
    }

    deactivate(){
        if(this.view.parentElement){
            this.view.parentElement.removeChild(this.view);
        }
    }

    drag(e){
        this.lastCoords = e;
        let pane = this.getPaneAt(e);
        let itemView = this.getItemViewAt(e);
        let item = e.target.item;

        if(pane && itemView && item && itemIsAllowedInPane(item, pane)){
            let coords = !(this.isOnlyTabInPane(pane, e.target) || pane.getItems().length === 0) ? [e.clientX, e.clientY] : undefined;
            this.lastSplit = this.updateView(itemView, coords);
        }else{
            this.disableView();
        }
    }

    end(e){
        this.disableView();

        if(!this.lastCoords || !this.getItemViewAt(this.lastCoords)){
            return;
        }

        const target = this.getPaneAt(this.lastCoords);

        if(!target){
            return;
        }

        const tab = e.target;
        const fromPane = tab.pane;
        const item = tab.item;

        let toPane = null;

        switch(this.lastSplit){
            case 'left':
                toPane = target.splitLeft();
                break;
            case 'right':
                toPane = target.splitRight();
                break;
            case 'up':
                toPane = target.splitUp();
                break;
            case 'down':
                toPane = target.splitDown();
                break;
            default:
                toPane = target;
        }

        //In the original source, this was above the switch, for some reason that is likely to make itself known during a live demonstration
        if(!itemIsAllowedInPane(item, toPane || target)){
            return;
        }

        if(toPane === fromPane){
            return;
        }

        fromPane.moveItemToPane(item, toPane);
        toPane.activateItem(item);
        toPane.activate();
    }

    getElement({clientX, clientY}, selector = '*'){
        return document.elementFromPoint(clientX, clientY).closest(selector);
    }

    getItemViewAt(coords){
        return this.test.itemView || this.getElement(coords, '.item-views');
    }

    getPaneAt(coords){
        let element = this.getElement(this.lastCoords, 'via-pane')
        return this.test.pane || (element && element.getModel());
    }

    isOnlyTabInPane(pane, tab){
        return pane.getItems().length === 1 && pane === tab.pane;
    }

    normalizeCoords({left, top, width, height}, [x, y]){
        return [(x - left) / width, (y - top) / height];
    }

    splitType([x, y]){
        if(x < 1 / 3){
            return 'left';
        }else if(x > 2 / 3){
            return 'right';
        }else if(y < 1 / 3){
            return 'up';
        }else if(y > 2 / 3){
            return 'down';
        }
    }

    boundsForSplit(split){
        switch(split){
            case 'left':   return [0,   0,   0.5, 1  ];
            case 'right':  return [0.5, 0,   0.5, 1  ];
            case 'up':     return [0,   0,   1,   0.5];
            case 'down':   return [0,   0.5, 1,   0.5];
            default:       return [0,   0,   1,   1  ];
        }
    }

    innerBounds({left, top, width, height}, [x, y, w, h]){
        left += x * width;
        top  += y * height;
        width  *= w;
        height *= h;
        return {left, top, width, height};
    }

    updateViewBounds({left, top, width, height}){
        this.view.style.left = `${left}px`;
        this.view.style.top = `${top}px`;
        this.view.style.width = `${width}px`;
        this.view.style.height = `${height}px`;
    }

    updateView(pane, coords){
        this.view.classList.add('visible');
        let rect = this.test.rect || pane.getBoundingClientRect();
        let split = coords ? this.splitType(this.normalizeCoords(rect, coords)) : 0;
        this.updateViewBounds(this.innerBounds(rect, this.boundsForSplit(split)));
        return split;
    }

    disableView(){
        this.view.classList.remove('visible');
    }
};

module.exports = new Layout();
