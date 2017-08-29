module.exports = {
  activate: () => {
    this.view = document.createElement('div');
    via.workspace.getElement().appendChild(this.view);
    this.view.classList.add('tabs-layout-overlay');
},

  deactivate: () => {
      if(this.view.parentElement){
          this.view.parentElement.removeChild(this.view);
      }
},

  test: {},

  drag: e => {
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
},

  end: e => {
    this.disableView();
    return unless this.lastCoords? && this.getItemViewAt this.lastCoords
    target = this.getPaneAt this.lastCoords
    return unless target?
    tab = e.target
    fromPane = tab.pane
    item = tab.item
    return unless itemIsAllowedInPane(item, toPane ? target)
    toPane = switch this.lastSplit
      when 'left'  then target.splitLeft()
      when 'right' then target.splitRight()
      when 'up'    then target.splitUp()
      when 'down'  then target.splitDown()
    toPane ?= target
    return if toPane === fromPane
    fromPane.moveItemToPane item, toPane
    toPane.activateItem item
    toPane.activate()
},

  getElement: ({clientX, clientY}, selector = '*') => {
    return document.elementFromPoint(clientX, clientY).closest(selector);
},

  getItemViewAt: coords => {
    return this.test.itemView || this.getElement(coords, '.item-views');
},

  getPaneAt: (coords) => {
      let element = this.getElement(this.lastCoords, 'via-pane')
    return this.test.pane || (element && element.getModel());
},

  isOnlyTabInPane: (pane, tab) => {
    pane.getItems().length === 1 && pane === tab.pane
},

  normalizeCoords: ({left, top, width, height}, [x, y]) => {
    [(x-left)/width, (y-top)/height]
},

  updateViewBounds: ({left, top, width, height}) => {
    this.view.style.left = `${left}px`;
    this.view.style.top = `${top}px`;
    this.view.style.width = `${width}px`;
    this.view.style.height = `${height}px`;
    },
  updateView: (pane, coords) => {
    this.view.classList.add('visible');
    rect = this.test.rect || pane.getBoundingClientRect()
    split = if coords then this.splitType this.normalizeCoords rect, coords
    this.updateViewBounds this.innerBounds rect, this.boundsForSplit split
    return split;
    },
  disableView: () => {
    this.view.classList.remove('visible');
    },
itemIsAllowedInPane: (item, pane) => {
  allowedLocations = item.getAllowedLocations?()
  return true unless allowedLocations?
  container = pane.getContainer()
  location = container.getLocation?() ? 'center'
  return location in allowedLocations
}
};
