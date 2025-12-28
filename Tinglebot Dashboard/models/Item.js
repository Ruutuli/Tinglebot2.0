// Add indexes for faster queries
Item.index({ craftingTags: 1 });
Item.index({ itemName: 1 });
Item.index({ craftingTags: 1, itemName: 1 }); 