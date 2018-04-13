
/* v2018-04
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
 this.syncWarnings = {'uploadWarnings':[],'uploadErrors':[]}
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
 if (!this.data.last_server_sync_time || !isNaN(this.data.last_server_sync_time)) this.data.last_server_sync_time= {};
	// Fix from previous version - can be eventually removed and self.data.last_server_sync_time={} defined above

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
                delete anItem._owner;
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

// Syncing 
jlos.prototype.sync = function(theList, options) {
	/* 
	theList is any list which is in the JLos data object - it corresponds to the collection name in freezr
	options are:
		gotNewItemsCallBack: function sending two lists - one of all new items added to theList, one with updated items.
		warningCallBack: function sending warning messages in case of errors - warnings are objects with an "error" describing error and a "msg", plus "item" if relevant showing item that had error
		uploadedItemTransform: function that transforms the data in the list before sending it to the server (typically used for encryption) - can also send back null if item should not be synced (eg when waiting for another operation to complete before syncing)
		downloadedItemTransform: function that transforms the data in the list when it is downloaded from the server (typically used for encryption)
		uploadedItemCallback: function that confirms when an item has been uploaded. Uploaded item ListItemNumber  is sent as an argument
		endCallBack: function called when the process is finished.
		doNotCallUploadItems: Boolean. Default is that uploadNewItems is automatically called 
		numItemsToFetchOnStart: Number of items to fetch when jlos is started
		permissionName: name of permission under which items are shred
	*/

	var self = this;
	var changedItems = [];
	var newItems = [];
	var oldCopiesOfChangedItems = [];
	if (!options) options = {};
	if (!options.warningCallBack) options.warningCallBack = function(msgJson) {console.log("WARNING: "+JSON.stringify(msgJson));}

	//onsole.log("startSyncItems - this.data.last_server_sync_time "+freezr.utils.longDateFormat( this.data.last_server_sync_time) );
	if (this.syncing) {
		console.log("Already Syncing...")
	} else {
		this.syncing=true;

		var queryOptions = {'collection':theList,'query_params':{}};
		if (options.permissionName) queryOptions.permission_name = options.permissionName
		//onsole.log("syncing "+theList)
		if (this.data.last_server_sync_time && this.data.last_server_sync_time[theList]) {
			queryOptions.query_params = {'_date_Modified':{'$gt':this.data.last_server_sync_time[theList]}};
			//onsole.log("queryOptions"+JSON.stringify(queryOptions))
		} else {
			queryOptions.query_params = {'$or': [{'fj_deleted':{$exists:false}},{'fj_deleted':false}]};
			queryOptions.count = (isNaN(options.numItemsToFetchOnStart) || !options.numItemsToFetchOnStart)? 20:options.numItemsToFetchOnStart;
			queryOptions.sort = {'_date_Modified': -1};
		}
		var self = this;
		//onsole.log("syncing "+theList,queryOptions)
		freezr.db.query(queryOptions, function(returnJson) {
			returnJson = freezr.utils.parse(returnJson);
			//onsole.log("returned items",returnJson)
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

					//onsole.log(returnJson)

					for (var i=0; i<returnJson.results.length; i++){
						returnItem = options.downloadedItemTransform? options.downloadedItemTransform(returnJson.results[i]): JSON.parse(JSON.stringify(returnJson.results[i]));
						
						resultIndex = self.idIndex(theList, returnItem, false);

						if (resultIndex >-1) {
							
							var existingItem = self.data[theList][resultIndex];

							if (existingItem._date_Modified >= returnItem._date_Modified) { // NO Conflicts - no need to change
								//onsole.log("NO NEED TO CHANGE "+returnItem._id);
								
							} else if (!existingItem.fj_modified_locally) { // NO Conflicts	- do replace
								//onsole.log("NO conflicts - replace"+returnItem._id);
								oldCopiesOfChangedItems.push(JSON.parse(JSON.stringify(existingItem) ) )
								self.data[theList][resultIndex] = returnItem;
								self.data[theList][resultIndex].fj_modified_locally=null;

								changedItems.push(returnItem);
								
							} else { // conflict exists
								//onsole.log("CONFLICT CONFLCT EXISTSS for - "+returnItem._id);
								oldCopiesOfChangedItems.push(JSON.parse(JSON.stringify(existingItem) ) )
								
								changedItems.push(returnItem);
								
								returnItem.fj_modified_locally = null;
								self.data[theList][resultIndex] = JSON.parse(JSON.stringify(returnItem));

								var copyOfExistingItem = (!existingItem.fj_deleted && self.options.addConflistAsNew)? self.options.addConflistAsNew(existingItem) : null;

								if (copyOfExistingItem) {
									copyOfExistingItem = JSON.parse(JSON.stringify(copyOfExistingItem))
									delete copyOfExistingItem._id;
									delete copyOfExistingItem.fj_local_temp_unique_id;
									delete copyOfExistingItem._owner;
									delete copyOfExistingItem._date_Created;
									delete copyOfExistingItem._date_Modified;
									copyOfExistingItem.fj_local_temp_unique_id = self.data.fj_local_id_counter++;
									copyOfExistingItem = JSON.parse(JSON.stringify(copyOfExistingItem));
									self.data[theList].push(copyOfExistingItem);
									newItems.push(copyOfExistingItem);
								}

								if (self.options.handleConflictedItem) self.options.handleConflictedItem(returnItem, resultIndex);		
							}

						} else if (!returnItem.fj_deleted){
							returnItem = JSON.parse(JSON.stringify(returnItem));
							returnItem.fj_modified_locally = null;
							if (self.data[theList] && self.data[theList].length>0){
								self.data[theList].push(returnItem);
							} else {
								self.data[theList]= [returnItem];
							}
							newItems.push(returnItem);
						} else {
							//onsole.log("NOT ADDDING DELETED NEW ITEM  ");
						}
						if (!self.data.last_server_sync_time[theList]) self.data.last_server_sync_time[theList]= 0;
						if (!self.data.last_server_sync_time[theList] || returnItem._date_Modified > self.data.last_server_sync_time[theList]) {
							self.data.last_server_sync_time[theList] = returnItem._date_Modified;
						}

					};
				}

				if (options.gotNewItemsCallBack) options.gotNewItemsCallBack(newItems,changedItems, oldCopiesOfChangedItems);

				if (!options.doNotCallUploadItems) {
					self.uploadNewItems(theList, options);
				} else {
					self.syncing = false;
					self.save();
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

	var listItemNumber = -1, anItem=null;;
	if (this.data[theList] && this.data[theList].length>0){
		for (var i = 0; i<this.data[theList].length; i++) {
			anItem = JSON.parse(JSON.stringify(this.data[theList][i]));
			if (anItem.fj_modified_locally) {
				if ((anItem._owner && anItem._owner!=freezr_user_id)) {
					console.warn("Internal error : cannot update another users 's records");
					console.log(anItem)
					anItem.fj_modified_locally=null;
				} else {
				try {
					anItem = options.uploadedItemTransform? options.uploadedItemTransform(anItem): anItem;
					if (!anItem) this.syncWarnings.uploadWarnings.push({list:theList, item:this.data[theList][i]})
				} catch(e) {
					this.syncWarnings.uploadErrors.push({list:theList, item:this.data[theList][i]});
					anItem = null;
				}
				if (anItem)	{
					listItemNumber = i;
					break;
				}
			}
			}

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

		if (anItem._owner) delete anItem._owner;
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

		//onsole.log("going to upload item :"+JSON.stringify(anItem));
		//onsole.log("with uploadOptions.updateRecord "+uploadOptions.updateRecord);
		//onsole.log("with options "+JSON.stringify(uploadOptions));

		freezr.db.write (anItem, uploadOptions, function (returnData) {
			// check that the item id is correct - update the item and set modified to null;
			returnData = freezr.utils.parse(returnData);
			if (returnData.error) {
				console.warn("error uplodaing",returnData,anItem)
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
				if (options.uploadedItemCallback) options.uploadedItemCallback(listItemNumber, self.data[theList][listItemNumber]);
				self.uploadNewItems (theList, options);

			} else {
				//onsole.log("ERR XXXXXXXXX with  noery data item "+listItemNumber+" was :"+self.data[theList][listItemNumber]._id + " vs " + returnData.confirmed_fields._id);
				options.warningCallBack({'error':"id mismatch on upload",msg:"There was an internal error uploading and syncing one of the items.", item:returnData.confirmed_fields})
				self.syncing=false;
				if (options.endCallBack) options.endCallBack();
			}

		} );

	} else { // no new items
		//onsole.log("No more items to sync");
		this.syncing = false;
		if (options.endCallBack) options.endCallBack();
	}
}
// Syncing 
jlos.prototype.getOlderItems = function(theList, options) {
	/* 
	theList is any list which is in the JLos data object - it corresponds to the collection name in freezr
	options are:
		warningCallBack: function sending warning messages in case of errors - warnings are objects with an "error" describing error and a "msg", plus "item" if relevant showing item that had error
		downloadedItemTransform: function that transforms the data in the list when it is downloaded from the server (typically used for encryption)
		endCallBack: function called when the process is finished.
		numItemsToFetchOnStart: Number of items to fetch when jlos is started

		lastOldest: searches for items older than this datenum
		'addToJlos': adds it to the current jlos - if false, can add manually later or selectively
		'queryParams': additional query parameters
		permissionName is permission used for access

	*/

	var self = this;
	var changedItems = [];
	var newItems = [];
	if (!options) options = {};
	let state = {lastOldest:new Date().getTime()};
	if (!options.warningCallBack) options.warningCallBack = function(msgJson) {console.log("WARNING: "+JSON.stringify(msgJson));}

	//onsole.log("startSyncItems - this.data.last_server_sync_time "+freezr.utils.longDateFormat( this.data.last_server_sync_time) );
	if (this.syncing) {
		options.warningCallBack({error:"already syncing", msg:"Snycing already in progress"});
	} else {
		this.syncing=true;
		var queryOptions = {'collection':theList,'query_params':options.queryParams};
		//onsole.log("fjlos syncing "+theList)

		if (options.lastOldest) state.lastOldest = options.lastOldest;
		queryOptions.query_params = options.queryParams || {};
		queryOptions.query_params['_date_Modified']={'$lt':state.lastOldest}
		queryOptions.query_params['$or']= [{'fj_deleted':{$exists:false}},{'fj_deleted':false}];
		//onsole.log("query_params",queryOptions.query_params)
		queryOptions.count = (isNaN(options.numItemsToFetchOnStart) || !options.numItemsToFetchOnStart)? 20:options.numItemsToFetchOnStart;
		queryOptions.sort = {'_date_Modified': -1};
		if (options.permissionName) queryOptions.permission_name = options.permissionName
		
		freezr.db.query(queryOptions, function(returnJson) {
			returnJson = freezr.utils.parse(returnJson);
			//onsole.log(" getolderitems "+theList+" returnJson",returnJson)

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
				//console.log("sync got returns of length "+((returnJson.results && returnJson.results.length>0)? returnJson.results.length:"none"))

				if (returnJson.results && returnJson.results.length>0) {
					function fjReverseSort(obj1,obj2) {
						return obj1._date_Modified - obj2._date_Modified
					}
					returnJson.results.sort(fjReverseSort)

					if (returnJson.results.length<queryOptions.count)state.noMoreItems = true

					for (var i=0; i<returnJson.results.length; i++){
						returnItem = options.downloadedItemTransform? options.downloadedItemTransform(returnJson.results[i]): JSON.parse(JSON.stringify(returnJson.results[i]));
						
						resultIndex = self.idIndex(theList, returnItem, false);


						if (resultIndex <0) {
							returnItem = JSON.parse(JSON.stringify(returnItem));
							returnItem.fj_modified_locally = null;
							if (options.addToJlos) {
								if (self.data[theList] && self.data[theList].length>0){
									self.data[theList].push(returnItem);
								} else {
									self.data[theList]= [returnItem];
								}
							}
							newItems.push(returnItem);
						} else if (returnItem._date_Modified > self.data[theList][resultIndex]._date_Modified){
							//onsole.log("Adding return item as date modified later",returnItem);
							returnItem=JSON.parse(JSON.stringify(returnItem));
							self.data[theList][resultIndex]=returnItem;
							newItems.push(returnItem);
						}

						if (returnItem._date_Modified < state.lastOldest) {
							state.lastOldest = returnItem._date_Modified;
						}
					}
				} else {
					state.noMoreItems = true
				}

				self.syncing = false;
				self.save();
				if (options.endCallBack) options.endCallBack(newItems, state);

			}

		});
	}
}
// accessing changing lists
jlos.prototype.list = function (theList, options={}) {
	retList = this.data[theList];
	if (!retList || retList.length==0) {
		retList = []
	} else if (options.sort) {
		let defaultDateSort =  (options.sort.field)? false:true;
		let field = options.sort.field || '_date_Modified';
		let asc = options.sort.asc || false;
		function fjCustomSort(obj1,obj2) {
			if((!obj1 && !obj2) || (!obj1[options.sort.field] && !obj2[options.sort.field])) return 0;
			if (!obj1 || !obj1[options.sort.field]) return asc? 1:-1;
			if (!obj2 || !obj2[options.sort.field]) return asc? -1:1; 
			return asc? (obj2[options.sort.field] - obj1[options.sort.field]): (obj1[options.sort.field] - obj2[options.sort.field]);
		}
		function defaultSort(obj1,obj2) {
			let value1 = obj1? (obj1.fj_modified_locally || obj1._date_Modified || 1 ) :0;
			let value2 = obj2? (obj2.fj_modified_locally || obj2._date_Modified || 1 ) :0;
			return (asc? 1:-1) * (value2 - value1);
		}
		if (defaultDateSort) {retList.sort( defaultSort)} else {retList.sort(fjCustomSort)} 
	}
	return retList;
}
jlos.prototype.get = function (theList, id, options = {idType:'both'}) {
	var refList = this.data[theList];
	//onsole.log("this.idIndex  "+theList+" len is "+refList.length+" checking "+anItem._id);
	theIndex = -1;

	if (refList && refList.length>0) {
		if (options.idType =='localtemp') {
			for (var i=0; i<refList.length; i++) {
				if (!refList[i]._id && refList[i].fj_local_temp_unique_id && refList[i].fj_local_temp_unique_id == id) {
					return this.data[theList][i];
				}
			}
		} else {
			for (var i=0; i<refList.length; i++) {
				if (refList[i]._id && refList[i]._id == id) {
					return this.data[theList][i];
				} else if (options.idType =="both" && !refList[i]._id && refList[i].fj_local_temp_unique_id && refList[i].fj_local_temp_unique_id == id) {
					return this.data[theList][i];
				}
			}
		}
	}
	return null;
}
jlos.prototype.add = function(theList, anItem) {
	if (!anItem._id && !anItem.fj_local_temp_unique_id) {
		anItem = JSON.parse(JSON.stringify(anItem));
		anItem.fj_modified_locally = new Date().getTime();
		anItem.fj_local_temp_unique_id = this.data.fj_local_id_counter++;
		if (!this.data[theList]) this.data[theList]=[];
		this.data[theList].push(anItem);
		return anItem;
	} else {
		console.error("Could not add a new item with existing id in the list "+theList)
		throw Error("cant add item with existing id")
		return null;
	}
}
jlos.prototype.updateItemFields = function(theList, recordIdOrTempLocalId, updateFields, overRideOwnership) {
	// finds the record using criteria, and updated 
	// normally shouldnt update a record which is not created by _owner. overRideOwnership over-rides this
	let idIndex = this.idIndex(theList, {'_id':recordIdOrTempLocalId,'fj_local_temp_unique_id':recordIdOrTempLocalId}, true)
	let theItem = idIndex>=0? this.data[theList][idIndex]: null;
	let isOwner = theItem? (!theItem._owner || theItem._owner==freezr_user_id):false;
	//console.log("theItem,isOwner",theItem,isOwner)
	if ((overRideOwnership || isOwner) && idIndex>=0) {
		if (updateFields){
			Object.keys(updateFields).forEach(function(aParam) {theItem[aParam]=updateFields[aParam]})
		}
		theItem.fj_modified_locally = new Date().getTime();
		return theItem;
	} else if (idIndex<0){
		console.warn("Could not find item",recordIdOrTempLocalId," in list "+theList)
		throw Error("could not find item to update")
	} else {return theItem}
}
jlos.prototype.updateFullRecord = function(theList, anItem) {
	// finds the full item by its id and replaces the full record
	let idIndex = this.idIndex(theList, anItem, true)
	if (idIndex>=0) {
		anItem = JSON.parse(JSON.stringify(anItem));
		anItem.fj_modified_locally = new Date().getTime();
		this.data[theList][idIndex] = anItem;
		//onsole.log("updated "+idIndex);
		return anItem
	} else {
		console.error("Could not find item",anItem,"in list "+theList)
		throw Error("could not find item to update")
	}
}
jlos.prototype.markDeleted = function(theList, recordIdOrTempLocalId, options={}) {
	// finds the record using criteria, and updated 
	let idIndex = this.idIndex(theList, {'_id':recordIdOrTempLocalId,'fj_local_temp_unique_id':recordIdOrTempLocalId}, (options.idType =='localtemp'))
	//onsole.log("markDeleted delete idIndex "+idIndex)
	if (idIndex>=0) {
		if (options && options.removeAllFields){
			const KEYSTOSTAY = ['_date_Modified','_date_Created','_owner','_id','_accessible_By','fj_modified_locally','fj_local_temp_unique_id']
			Object.keys(updateFields).forEach(function(aParam) {if (KEYSTOSTAY.indexOf(aParam)<0) delete this.data[theList][idIndex][aParam]})
		}
		this.data[theList][idIndex].fj_deleted = true;
		this.data[theList][idIndex].fj_modified_locally = new Date().getTime();
		this.save();
		return this.data[theList][idIndex];
	} else {
		console.error("Could not find item",anItem,"in list "+theList)
		throw Error("could not find item to update");
		return null
	}
}


jlos.prototype.idIndex = function(theList, anItem, searchLocalTempIds) {
	var refList = this.data[theList];
	//onsole.log("this.idIndex  "+theList+" len is "+refList.length+" checking "+( anItem? anItem._id: "no item") );
	theIndex = -1
	if (refList && refList.length>0) {
		for (var i=0; i<refList.length; i++) {
			if (refList[i] && refList[i]._id && refList[i]._id == anItem._id) {
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
jlos.prototype.removeLocalCopy = function(theList, criteria) {
	var refList = this.data[theList];
	if (refList && refList.length>0) {
		for (var i=refList.length-1; i>-1; i--) {
			let meetsCriteria = true
			Object.keys(criteria).forEach(aParam => {
				if (criteria[aParam] != refList[i][aParam]) meetsCriteria=false;
			})
			if (meetsCriteria) refList.splice(i,1)
		}
	}
}
jlos.prototype.isEmpty = function (theList) {
	return (!this.data[theList]|| this.data[theList].length==0)
	// also check if is Array
}

jlos.prototype.queryNum = function (theList, params, options) {
	//options to add: startAtBeg
	// search params
	var refList = this.data[theList];
	let theItemNum=-1, isCandidate=true;
	//onsole.log(params)
	if (refList && params) {
		for (var i=refList.length-1; i>-1; i--) {
			isCandidate = true;
			Object.keys(params).forEach(function(aParam) {
				if (isCandidate && refList[i][aParam] == params[aParam]) {
					isCandidate = true;
				} else {
					isCandidate = false;
				}
			})
			if (isCandidate) {
				theItemNum = i;
				break; 
			}
		}
	}
	return theItemNum;
}
jlos.prototype.idFromNum = function (theList, listNum) {
	let refList = this.data[theList];
	if (listNum>-1 && refList[listNum]) {
		return refList._id || refList.fj_local_temp_unique_id;
	} else {
		return null;
	}
}
jlos.prototype.queryObjs = function (theList, params, options) {
	// options: makeCopy
	//options to add: startAtBeg
	// search params
	var refList = this.data[theList];
	let objectList = [], isCandidate=true;
	//console.log(params)
	if (refList && params) {
		for (var i=refList.length-1; i>-1; i--) {
			isCandidate = true;
			Object.keys(params).forEach(function(aParam) {
				if (isCandidate && (refList[i][aParam] == params[aParam] || (!refList[i][aParam] && !params[aParam]))) {
					isCandidate = true;
				} else {
					isCandidate = false;
				}
			})
			if (isCandidate) objectList.push((options && options.makeCopy)? JSON.parse(JSON.stringify(refList[i])) : refList[i])
		}
	}
	return objectList;
}

