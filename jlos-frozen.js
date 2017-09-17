
/* v2016-12
jlos - Json Local Storage
jlos is a simple object for storing data in local storage, without using the filesystem for archiving data.
jlos-frozen has additional syncing functionality for freezr

fj_modified_locally has to be updated by your script to the current time so that syncing can take place

Dependency: freezr_core.js

// options -
	saver:
		nosave, dosave, auto (default)
	 	set to dosave if working on development - other wise, it is unsafe to do so outside of an non-web-based app
	dealWithConflicts:
		function that allows you to transform the copy of the item and send it back for jlos to store it
		if return null, the conflicted copy is not kept
		easiest function would be function(copyOfItem) {return copyOfItem}
*/

function jlos(name, options) {
  this.name = name;
  this.initialize(options);
}

jlos.prototype.initialize = function (options) {
 this.options = options? options : {};
 this.options.dealWithConflicts = options.addConflistAsNew;
 this.writeError = false;
 this.options.saver = options.saver? options.saver: "auto";
 this.syncing = false;
 if (this.saveLS() && localStorage["jlos-data-"+this.name] && localStorage["jlos-data-"+this.name].length>0){
 	var inside = localStorage["jlos-data-"+this.name];
	try {
		this.data = JSON.parse(inside);
	} catch (e) {
		console.log(e);
		this.writeError = true;
		this.data.error="Error parsing jlos file - now stored under 'inside'"
		this.data.inside = inside;
	}
 } else if (options && options.valueAtInit) {
	this.data = options.valueAtInit; 
 } else {
	this.data = {};
 }
 this.data.fj_local_id_counter = this.data.fj_local_id_counter? this.data.fj_local_id_counter:1;
 this.save();
};
jlos.prototype.reInitializeData = function () {
	this.data = (this.options && this.options.valueAtInit)? this.options.valueAtInit:{};
	this.save();
}
jlos.prototype.save = function () {
	//onsole.log("prototype save "+this.name );
	if (this.saveLS() && !this.writeError) {
		localStorage["jlos-data-"+this.name]= JSON.stringify(this.data); 
	}
};

jlos.prototype.reload = function () {
	 if (this.saveLS() && localStorage["jlos-data-"+this.name] && localStorage["jlos-data-"+this.name].length>0){
		this.data = JSON.parse(localStorage["jlos-data-"+this.name]);
		if (!this.data) this.data={};
	 } else {
	 	//onsole.log("resetting reload with no saver!!!!!!")
		this.data = {};
	 }
};


jlos.prototype.remove = function () {
	this.data={};
	if (this.saveLS()) { 
		localStorage.removeItem("jlos-data-"+this.name);
		this.save();
	}
};

jlos.prototype.saveLS = function () {
	return ( (this.options.saver == "dosave") ||  ((!this.options.saver || this.options.saver == "auto") && freezr && freezr.app && !freezr.app.isWebBased) );
 };

jlos.prototype.getSpaceUsed = function() {
	if (this.saveLS()) {
		var x, self, total=0;
		for (x in localStorage){
			total+=localStorage[x].length * 2
		}; 
		//log.push("Total = " + (total/1024/1024).toFixed(2)+ " MB"); 
		return {'total':(total/1024), 'this':(localStorage["jlos-data-"+this.name].length*2/1024)} ;
	} else {return null;}

}

jlos.prototype.removeFreezrInfo = function(theList) {
	var self = this;
	if (self.data[theList] && self.data[theList].length>0) {
            self.data[theList].forEach(function(anItem) {
            	anItem.fj_modified_locally = anItem._date_Modified+0
                delete anItem._id;
                delete anItem._date_Modified;
                delete anItem._date_Created;
                delete anItem._creator;
            });
    }
    self.save();
}
jlos.prototype.removeSyncedFreezrInfo = function(theList) {
	var self = this;
	if (self.data[theList] && self.data[theList].length>0) {
		for (var i=self.data[theList].length-1; i>-1; i--){
			if (self.data[theList][i]._id) {self.data[theList].splice(i,1)}
		} 
    }
    self.save();
}
// Syncing - to move to jlos
jlos.prototype.sync = function(theList, options) {
	/* 
	theList is any list which is in the JLos data object - it corresponds to the collection name in freezr
	options are:
		gotNewItemsCallBack: function sending two lists - one of all new items added to theList, one with updated items.
		warningCallBack: function sending warning messages in case of errors - warnings are objects with an "error" describing error and a "msg", plus "item" if relevant showing item that had error
		uploadedItemTransform: function that transforms the data in the list before sending it to the server (typically used for encryption)
		downloadedItemTransform: function that transforms the data in the list when it is downloaded from the server (typically used for encryption)
		uploadedItemCallback: function that confirms when an item has been uploaded. Uploaded item ListItemNumber  is sent as an argument
		endCallBack: function called when the process is finished.
		doNotCallUploadItems: Boolean. Default is that uploadNewItems is automatically called 
		numItemsToFetchOnStart: Number of items to fetch when jlos is started
	*/

	var self = this;
	var changedItems = [];
	var newItems = [];
	if (!options) options = {};
	if (!options.warningCallBack) options.warningCallBack = function(msgJson) {console.log("WARNING: "+JSON.stringify(msgJson));}

	//onsole.log("startSyncItems - this.data.last_server_sync_time "+freezr.utils.longDateFormat( this.data.last_server_sync_time) );
	if (this.syncing) {
		console.log("Already Syncing...")
	} else {
		this.syncing=true;
		var queryOptions = {'collection':theList,'query_params':{}};
		//onsole.log("syncing "+theList)
		if (this.data.last_server_sync_time && this.data[theList].length>0) {
			queryOptions.query_params = {'_date_Modified':{'$gt':this.data.last_server_sync_time}};
		} else {
			queryOptions.query_params = {'$or': [{'fj_deleted':{$exists:false}},{'fj_deleted':false}]};
			queryOptions.count = (isNaN(options.numItemsToFetchOnStart) || !options.numItemsToFetchOnStart)? 20:options.numItemsToFetchOnStart;
			queryOptions.sort = {'_date_Modified': -1};
		}
		var self = this;
		freezr.db.query(queryOptions, function(returnJson) {
			returnJson = freezr.utils.parse(returnJson);
			if (returnJson.error) {
				console.log("error syncing")
				self.syncing = false;
				if (returnJson.errorCode && returnJson.errorCode == "noServer") {
					options.warningCallBack({error:"no connection", msg:"Could not connect to server"});
				} else {
					options.warningCallBack({error:"server Error", msg:"Error syncing."});
				}
				if (options.endCallBack) options.endCallBack(returnJson);
			} else {
				var resultIndex = -1;
				var temp=0;
				//onsole.log("sync got returns of length "+((returnJson.results && returnJson.results.length>0)? returnJson.results.length:"none"))

				if (returnJson.results && returnJson.results.length>0) {
					function fjReverseSort(obj1,obj2) {
						return obj1._date_Modified - obj2._date_Modified
					}
					returnJson.results.sort(fjReverseSort)

					for (var i=0; i<returnJson.results.length; i++){
						returnItem = options.downloadedItemTransform? options.downloadedItemTransform(returnJson.results[i]): JSON.parse(JSON.stringify(returnJson.results[i]));
						resultIndex = self.idIndex(theList, returnItem, false);

						if (resultIndex >-1) {
							
							var existingItem = self.data[theList][resultIndex];

							if (existingItem._date_Modified >= returnItem._date_Modified) { // NO Conflicts - no need to change
								//onsole.log("NO NEED TO CHANGE "+returnItem._id);
								
							} else if (!existingItem.fj_modified_locally) { // NO Conflicts	- do replace
								//onsole.log("NO conflicts - replace"+returnItem._id);
								self.data[theList][resultIndex] = returnItem;
								self.data[theList][resultIndex].fj_modified_locally=null;

								changedItems.push(returnItem);
								
							} else { // conflict exists
								//onsole.log("CONFLICT CONFLCT EXISTSS for - "+returnItem._id);
								changedItems.push(returnItem);
								
								returnItem.fj_modified_locally = null;
								self.data[theList][resultIndex] = JSON.parse(JSON.stringify(returnItem));

								var copyOfExistingItem = (!existingItem.fj_deleted && self.options.addConflistAsNew)? self.options.addConflistAsNew(existingItem) : null;

								if (copyOfExistingItem) {
									copyOfExistingItem = JSON.parse(JSON.stringify(copyOfExistingItem))
									delete copyOfExistingItem._id;
									delete copyOfExistingItem.fj_local_temp_unique_id;
									delete copyOfExistingItem._creator;
									delete copyOfExistingItem._date_Created;
									delete copyOfExistingItem._date_Modified;
									copyOfExistingItem.fj_local_temp_unique_id = self.data.fj_local_id_counter++;
									copyOfExistingItem = JSON.parse(JSON.stringify(copyOfExistingItem));
									self.data[theList].push(copyOfExistingItem);
									newItems.push(copyOfExistingItem);
								}
		 
								if (returnItem.fj_deleted) {
									var noteDiv = document.getElementById('click_gotoNote_'+resultIndex+"_wrap");
									if (noteDiv) removeDiv(noteDiv);
									if (self.data.current_post == resultIndex) {showFirstValidNote();}
								}

								if (resultIndex == self.data.current_post) showCurrentNote();
							}

						} else if (!returnItem.fj_deleted){
							returnItem = JSON.parse(JSON.stringify(returnItem));
							returnItem.fj_modified_locally = null;
							if (!self.data.fj_oldest_item || returnItem._date_Modified<self.data.fj_oldest_item) self.data.fj_oldest_item= returnItem._date_Modified;
							if (self.data[theList] && self.data[theList].length>0){
								self.data[theList].push(returnItem);
							} else {
								self.data[theList]= [returnItem];
							}
							newItems.push(returnItem);
						} else {
							//onsole.log("NOT ADDDING DELETED NEW ITEM  ");
						}
						if (!self.data.last_server_sync_time || returnItem._date_Modified > self.data.last_server_sync_time) {
							self.data.last_server_sync_time = returnItem._date_Modified;
						}

					};
				}

				if (options.gotNewItemsCallBack) options.gotNewItemsCallBack(newItems,changedItems);

				if (!options.doNotCallUploadItems) {
					self.uploadNewItems(theList, options);
				} else {
					self.syncing = false;
					self.save;
				}
			}

		});
	}
}
jlos.prototype.uploadNewItems = function (theList, options) {
	// for options list, see startSyncItems. (gotNewItemsCallBack and doNotCallUploadItems are not called.)
	// Unless items cannot be updated, it is unsafe to call this without calling startSyncItems because only startSyncItems checks for conflicts. this function just over-writes the previous version.
	//onsole.log("uploadNewItems")
	var self = this;
	if (!options) options = {};
	if (!options.warningCallBack) options.warningCallBack = function(msgJson) {console.log("WARNING: "+JSON.stringify(msgJson));}

	var listItemNumber = -1, anItem;
	for (var i = 0; i<this.data[theList].length; i++) {
		anItem = this.data[theList][i];
		if (anItem.fj_modified_locally) {
			listItemNumber = i;
			anItem = JSON.parse(JSON.stringify(anItem));
			break;
		}
	}
	if (listItemNumber>=0) {
		if (!anItem._id && !anItem.fj_local_temp_unique_id) {
			this.data[theList][listItemNumber].fj_local_temp_unique_id = this.data.fj_local_id_counter++;
		}
		// to add device
		//this.data[theList][listItemNumber].fj_device_modified_on = 
		this.save();
		var uploadOptions = {'collection':theList, 'confirm_return_fields':['fj_local_temp_unique_id','_date_Created','_date_Modified','_id','fj_deleted']};

		anItem = JSON.parse(JSON.stringify(anItem));

		if (anItem._creator) delete anItem._creator;
		delete anItem._date_Modified;
		delete anItem._last_Modified;
		delete anItem._accessible_By;
		if (anItem._date_Created) delete anItem._date_Created;
		if (!anItem.fj_deleted) anItem.fj_deleted=false;
		if (anItem._id) {
			uploadOptions.updateRecord = true;
			uploadOptions.data_object_id = anItem._id;
			delete anItem._id;
		}
		var transformError = false;
		try {
			anItem = options.uploadedItemTransform? options.uploadedItemTransform(anItem): anItem;
		} catch(e) {
			options.warningCallBack({'error':"post transform error",msg:"internal error."})
			this.syncing = false;
			transformError=true;
			if (options.endCallBack) options.endCallBack();
		}

		//onsole.log("going to upload item :"+JSON.stringify(anItem));
		//onsole.log("with options "+JSON.stringify(uploadOptions));
		if (!transformError) {
			freezr.db.write (anItem, uploadOptions, function (returnData) {
				// check that the item id is correct - update the item and set modified to null;
				returnData = freezr.utils.parse(returnData);
				if (returnData.error) {
					options.warningCallBack({'error':returnData.error, code:returnData.code, msg:"error uploading note to database "+(returnData.message? returnData.message:""), "item":anItem, "status":returnData.status});
					self.syncing=false;
					if (options.endCallBack) options.endCallBack();
				} else if ( !self.data[theList][listItemNumber]._id  || (self.data[theList][listItemNumber]._id == returnData.confirmed_fields._id) 
					|| (
						!self.data[theList][listItemNumber]._id && 
						self.data[theList][listItemNumber].fj_local_temp_unique_id &&
						self.data[theList][listItemNumber].fj_local_temp_unique_id == returnData.confirmed_fields.fj_local_temp_unique_id) ) {
					//onsole.log("uploaded with new id "+returnData.confirmed_fields._id);
					if (!self.data[theList][listItemNumber]._id)  self.data[theList][listItemNumber]._id = returnData.confirmed_fields._id;
					self.data[theList][listItemNumber].fj_modified_locally = null;
					self.data[theList][listItemNumber]._date_Modified = returnData.confirmed_fields._date_Modified;
					self.save();
					//onsole.log("UPLOAD  SUCCESS - ITEM IS NOW "+JSON.stringify(self.data[theList][listItemNumber]));
					if (options.uploadedItemCallback) options.uploadedItemCallback(listItemNumber);
					self.uploadNewItems (theList, options);

				} else {
					//onsole.log("ERR XXXXXXXXX with  noery data item "+listItemNumber+" was :"+self.data[theList][listItemNumber]._id + " vs " + returnData.confirmed_fields._id);
					options.warningCallBack({'error':"id mismatch on upload",msg:"There was an internal error uploading and syncing one of the items.", item:returnData.confirmed_fields})
					self.syncing=false;
					if (options.endCallBack) options.endCallBack();
				}

			} );
		}

	} else { // no new items
		//onsole.log("No more items to sync");
		this.syncing = false;
		if (options.endCallBack) options.endCallBack();
	}
}

jlos.prototype.idIndex = function(theList, anItem, searchLocalTempIds) {
	var refList = this.data[theList];
	//onsole.log("this.idIndex  "+theList+" len is "+refList.length+" checking "+anItem._id);
	theIndex = -1
	if (refList && refList.length>0) {
		for (var i=0; i<refList.length; i++) {
			if (refList[i]._id && refList[i]._id == anItem._id) {
				theIndex = i;
				break;
			}
		}
	}
	if (searchLocalTempIds && theIndex == -1) { // generally a locally created conflicted copy that has no id but has a temporary local id
		for (var i=0; i<refList.length; i++) {
			if (!refList[i]._id && refList[i].fj_local_temp_unique_id && refList[i].fj_local_temp_unique_id == anItem.fj_local_temp_unique_id) {
				theIndex = i;
				break;
			}
		}
	}
	return theIndex;
}
