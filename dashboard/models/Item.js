// Add indexes for faster queries
Item.index({ itemName: 1 });
Item.index({ craftingJobs: 1, itemName: 1 }); 