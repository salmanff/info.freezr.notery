
// notery.js - a freezr app by sf v2016-08
		// App originaly based on Dave Winer's
		//	myword.io/testing/hellomediumeditor.html 
		//	which is based on github.com/yabwe/medium-editor

var notery; 
var curr_post_pointer = {
	// data related to the current post being shown
	num:0,
	section:"local",
	changedSinceChosen:false,
	created_locally: null,
	_id:null // _id from server
	}
var stats = {
	// miscellaneous vars
	'warningTimeOut':null,
	'syncInProgress': false,
	'alreadySyncedOnce': false,
	'startTouch':{id:null, startX:0, startY:0, moveX:0, moveY:0} ,
	'local_backup_timer': null,
	'encryptPW':null, // in case user doesn't want encrypt password to be strored
	'encryptFault':false,
	'localSaveIntervaler':null,
	'syncCounter': 1
	}
	var SAVES_PER_SYNC = 5;
	var NUM_NOTES_TO_DOWNLOAD = 20; 

// Start Up
freezr.initPageScripts = function() {
	notery = new jlos('notery', 
		{'valueAtInit':
		   {'max_post_to_keep':20,
			'last_server_sync_time': 0,
			'local_backups_last_save':0,
			'local_backups_do':false,
			'local_backup_interval': "",
			'local_backups_changed_since_last_save':false,
			'fj_oldest_item':null,
			'fj_local_id_counter':1,
			'encryptDo':false, // whether you choose to encrypt or not
			'encryptPW':null,  // the password (null if not stored locaaly)
			'encryptCipherTest':null, // a test cipher to make sure password is correct when re-entered
			'freezr_user_id': null, // user id
			'freezr_server_address':null, // used for offline usage
			'freezr_app_code': null, // used for offline usage
			'posts': //list of json of latest posts including server_version_details
			[/*
				{
					'title':null, 
					'labels':null,
					'body':null,
					'deleted':false,
					'cipher': holding all encryptiond ata if post is encrypted
					'headers': generated automatically - list of title and labels
					'fj_local_temp_unique_id':null,
					'fj_modified_locally':null, // null if has not been modified
					'_date_Modified':0,
					'fj_device_modified_on':null //,
				}
				*/
			]	
		  },
		'addConflistAsNew':createConflictedNote
	}); 
	if (notery.data.freezr_app_code) {
		freezr_app_code = notery.data.freezr_app_code;
		freezr_user_id = notery.data.freezr_user_id;
		freezr_server_address= notery.data.freezr_server_address;
		freezr_user_is_admin = notery.data.freezr_user_is_admin;
	}

	document.addEventListener('click', function(e) { 
		var elSects = e.target.id.split('_');
		if (elSects[0]== "click") {doClick(elSects)}
	}, false);
	document.addEventListener('touchstart', function(e) { 
		if (e.target.id == "click_menuBackGround") {
			doClick(['click','menuBackGround']);
		} else {
			stats.startTouch.id = e.target.id;
			stats.startTouch.startX = e.touches[0].pageX;
			stats.startTouch.moveX = e.touches[0].pageX;
			stats.startTouch.startY = e.touches[0].pageY;
			stats.startTouch.moveY = e.touches[0].pageY;
		}
	}, false);
	document.addEventListener('touchmove', function(e) { 
		stats.startTouch.moveX = e.touches[0].pageX; 
		stats.startTouch.startY = e.touches[0].pageY; 
	}, false);
	document.addEventListener('touchend', function(e) { 
		if (stats.startTouch.id == e.target.id) { 
			var elSects = e.target.id.split('_');
			if (elSects[0]== "click") {
				e.preventDefault();
				doClick(elSects);
			}
		}
		stats.startTouch = null;
	}, false);
	document.getElementById('idTitle').onkeydown= function (evt) {
		if (evt.keyCode == 13 || evt.keyCode == 9) {evt.preventDefault(); saveNote(); document.getElementById('idLabels').focus();}
	}
	document.getElementById('idLabels').onkeydown= function (evt) {
		if (evt.keyCode == 13 ) {evt.preventDefault(); }
		if (evt.keyCode == 13 || evt.keyCode == 9) {evt.preventDefault(); saveNote(); $('#summerEditor').find('.note-editable').focus(); }
	}
	document.getElementById('idSearchBox').onkeypress= function (evt) {
		if (evt.keyCode == 13 || evt.keyCode == 32) {
			if (evt.keyCode == 13) evt.preventDefault();
			doSearchLocally(); 
		} 
	}
	var pasteAsText = function(evt) {
		// for more details and improvements: stackoverflow.com/questions/12027137/javascript-trick-for-paste-as-plain-text-in-execcommand
		evt.preventDefault();
		var text = evt.clipboardData.getData("text/plain");
	    document.execCommand("insertHTML", false, text);
	};
	document.getElementById('idTitle').onpaste= pasteAsText;
	document.getElementById('idLabels').onpaste= pasteAsText;
	document.getElementById('idSearchBox').onpaste= pasteAsText;


	document.getElementById('saveMinutes').onkeydown= function (evt) {
		if (evt.keyCode == 13 || evt.keyCode == 32) {
			evt.preventDefault();
			saveIntervals();
		} else if((event.keyCode < 48 || event.keyCode > 57) && event.keyCode!=8 && event.keyCode!=46 ){
			return false;
		} else {
			document.getElementById('click_saveIntervals_1').className = document.getElementById('click_saveIntervals_1').className.replace("notClickingDummy", " clickable");
		}
	}
	document.getElementById('encPassword_1').onkeydown= function (evt) {
		if (document.getElementById("xtraMenuPwdEnter_2").style.display=="none") {document.getElementById('click_savePassword_1').className = document.getElementById('click_savePassword_1').className.replace("notClickingDummy", " clickable");}
		if (evt.keyCode == 13 || evt.keyCode == 9) {
			evt.preventDefault();
			doClick(["click","savePassword","1"]);
		} 
	}
	document.getElementById('encPassword_2').onkeydown= function (evt) {
		if (evt.keyCode == 13 || evt.keyCode == 9) {
			evt.preventDefault();
			doClick(["click","savePassword","2"]);
		} 
	}
	document.onkeydown= function (evt) {
		if ((evt.metaKey || evt.ctrlKey) && evt.keyCode== 83 && !stats.encryptFault) {
			evt.preventDefault();
			saveNote();
			doSyncPosts();
		} else if (evt.keyCode== 27){
			freezr.utils.closeMenuOnEscape(evt);
		}
	}
	window.addEventListener("popstate", function(e) {
		e.preventDefault();
		if (window.location.search == "" && window.location.origin != "file://") {
			history.pushState(null, null, '?section=menu');
		} else if (window.location.search == "?section=menu") {
			if (isMobile() || isSmallScreen() ) toggleLeftMenu();  
		} else {
			var parts = window.location.search.split("&");
			if (parts.length==2) {
				var sect = parts[0].split("=")[1];
				var num = parts[1].split("=")[1];
				gotoNote(num,sect, true);
			}
		} 
	},true);
	if (window.location.origin != "file://") history.pushState(null, null, '?section=menu');
	if (window.location.origin != "file://") history.pushState(null, null, '?section=menu');

	setMobileVersion(true);
	startup();

	if (notery.data.local_backups_do) {stats.local_backup_timer = self.setInterval (doLocalBackUp,  notery.data.local_backup_interval  ) }; 	
}
var startup = function() {
	var wrongId = false;

	if (notery.data.encryptPW) stats.encryptPW = notery.data.encryptPW;
	decryptAllPosts();

	if (!notery.data.freezr_user_id) notery.data.freezr_user_id = freezr_user_id? freezr_user_id:null;
	if (freezr_user_id && freezr_user_id != notery.data.freezr_user_id){
		if (confirm("There is data from another user on your device. If you press okay, that data will be deleted.")) {
			notery.reInitializeData();
			notery.data.freezr_user_id = freezr_user_id;
			stats.encryptPW=null;
			notery.save();
		} else {
			wrongId = true;
			window.location.href = '/';
		}
	} 
	document.getElementById('xtraMenu').style.display="none";

	document.getElementById('xtraMenu').style["-webkit-transform"] = "translate3d(-"+(Math.max(window.innerWidth,window.innerHeight)+50)+"px, 0, 0)";

	if (!wrongId) {
		populateLeftPanel();
		document.getElementById("click_syncNow_0").className = document.getElementById("click_syncNow_0").className.replace("fa fa-refresh clickable topBut","fa fa-spin fa-refresh topBut");
		if (  (!freezr.app.isWebBased && !freezr_app_code) || stats.encryptFault  || (notery.data.encryptDo && !stats.encryptPW) ) {
			wrapUpTryingToSync();
		} else {
			if (!freezr.app.isWebBased) {
				wrapUpTryingToSync();
				if (usingMobileVersion) {setTimeout(toggleLeftMenu,10)}
			} 
			doSyncPosts();
		}
	}
}
var toolbarDiv,bodyDiv, scrollTimer=null;
var initialiseEditors = function() {
	$('#summerEditor').summernote('destroy');

	var toolbarlist = [ ];
	var indentButton = function (context) {
	  var ui = $.summernote.ui;
	  var button = ui.button({
	    contents: '<i class="fa fa-indent"/>',
	    tooltip: 'indent',
	    click: function () { context.invoke('editor.indent');}
	  });
	  return button.render(); 
	}
	var outdentButton = function (context) {
	  var ui = $.summernote.ui;
	  var button = ui.button({
	    contents: '<i class="fa fa-outdent"/>',
	    tooltip: 'outdent',
	    click: function () { context.invoke('editor.outdent');}
	  });
	  return button.render(); 
	}


	if (window.innerWidth>550) toolbarlist.push(['color', ['color']],['para', []],['para', []]);
	toolbarlist.push(
		    ['para', ['ul']],
		    ['para', []],
		    ['para', ['indy']], 
		    ['para', []],['para', []],
		    ['para', ['outy']], 
		    ['para', []],['para', []],
		    ['para', [ 'ol']],
		    ['para', []],['para', []],
		    ['style', ['bold']],['para', []])
	if (window.innerWidth>(isSmallScreen()?355:610)) toolbarlist.push(['style', ['italic']],['para', []],['para', []]);
	if (window.innerWidth>(isSmallScreen()?400:655)) toolbarlist.push(['style', ['underline']],['para', []],['para', []]);
	if (window.innerWidth>(isSmallScreen()?460:715)) toolbarlist.push(['insert', ['link']],['para', []],['para', []])
	if (window.innerWidth>(isSmallScreen()?495:760)) toolbarlist.push(['insert', ['codeview']]);

	$('#summerEditor').summernote({
		maxHeight: ((usingMobileVersion )? null: (window.innerHeight-180)), 
		height:((usingMobileVersion )? null:(window.innerHeight-150) ),
		toolbar: toolbarlist,
		buttons: {indy: indentButton, outy: outdentButton},
	});

	bodyDiv = document.getElementsByClassName("panel-body")[0];

	
	if (usingMobileVersion) {
		toolbarDiv = document.getElementsByClassName("note-toolbar panel-heading")[0];
		toolbarDiv.style.position = "absolute"
		toolbarDiv.style.top = "0px";
		toolbarDiv.style.left = "0px";
		toolbarDiv.style.right = "0px";
		toolbarDiv.style.zIndex = "8";
		toolbarDiv.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
		bodyDiv.style.paddingTop = "50px";

		
		window.onscroll=function(){
			if (scrollTimer) clearTimeout(scrollTimer);
			scrollTimer = setTimeout(function(){ toolbarDiv.style.display = "block";}, 100);

			toolbarDiv.style.display = "none";
			var moveAmt = document.body.scrollTop>60? (-document.getElementById("editorContainer").getBoundingClientRect().top+20) : 0; 
			toolbarDiv.style.top=(moveAmt+"px")
		};
	} 
	
	foreColorel = document.getElementsByClassName("note-icon-font note-recent-color")[0];
	if (foreColorel) foreColorel.style.color = "#0000FF";
	$('#summerEditor').on('summernote.keydown', function(evt) {
		if (!stats.localSaveIntervaler) stats.localSaveIntervaler = setInterval(saveNote,2000);
	});

};
var doClick = function (args) {
	//onsole.log("click "+args)
	switch(args[1]) {
		case 'newNote':
			showWarning();
			hideLeftMenu();
			newNote();
			break;
		case 'xtraMenuSlider':
			xtraMenuToggle(false);
			break;
		case 'xtraMenuClose':
			xtraMenuToggle(true);
			break;
		case 'gotoNote':
			gotoNote(args[3],args[2]);
			break;
		case 'deleteNote':
			xtraMenuToggle(true);
			deleteCurrentNote();
			break;
		case 'quitNotery':
			removeJlosAndQuit();
			break;
		case 'doLocalBackUp':
			doLocalBackUp(true);
			break;
		case 'saveIntervals':
			saveIntervals();
			break;
		case 'syncNow':
			document.getElementById("click_syncNow_0").className = document.getElementById("click_syncNow_0").className.replace("fa fa-refresh clickable topBut","fa fa-spin fa-refresh topBut");
			saveNote();
			clickedToSyncPosts();
			break;
		case 'searchNowHeaders':
			toggleSearchDivs("Labels");
			doSearchLocally("headers");
			break;
		case 'searchNowAllText':
			toggleSearchDivs("Text");
			doSearchLocally("allText");
			break;
		case 'searchOnline':
			doSearchOnline();
			break;
		case 'clearSearch':
			$('#idSearchBox').html('');
			onlineSearch.posts = [];
			doSearchLocally("headers");
			break;
		case 'takeOffline':
			takeOnlineNotesOffline(true);
			break;
		case 'importToPosts':
			takeOnlineNotesOffline(false);
			break;
		case 'menuBackGround':
			if (usingMobileVersion || usingSmallScreenVersion) toggleLeftMenu();
			break;
		case 'viewBackUpNotes':
			viewBackUpNotes();
			break;
		case 'cleanNotes':
			cleanAndReorderNotesList();
			break;
		case 'topLogo':
			if (document.getElementById("xtraMenu").style.display=="block") {
				xtraMenuToggle(true);
			} else if (usingMobileVersion || usingSmallScreenVersion) {
				toggleLeftMenu();
			}  
			break;
		case 'savePassword':
			savePasswordNextStep(args[2]=="1");
			break;
		default:
			 console.log('undefined click ')
	}
}

// Note Actions 
var saveNote = function(forceSaveAndSync) {
	var curr_post_details = curr_post_pointer.section == "local"? notery.data.posts[curr_post_pointer.num]: onlineSearch.posts[curr_post_pointer.num];
	if (curr_post_pointer.num<0 ) {
		showWarning("")
		showWarning("No Notes. Press Clear Search for more notes, or New Note for a new note.")
	} else if (!curr_post_details) {
		showWarning("ERROR - COULD NOT SAVE POST - NO POST FOUND",5000);
	} else if(!post_consistent_with_current_data(curr_post_details) ) {
		showWarning("Need to reset posts - conflict created",5000);
		if (!freezr.app.isWebBased) {alert("There was an errr saving. Please restart the app.")}
		else if (confirm ( "Unexpected error in SaveNote - Press okay restart app") )  {window.location = "/apps/info.freezr.notery"};
	} else if (curr_post_details.cipher) {
		showWarning();
		notery.data.encryptDo = true;
		stats.encryptFault = true; //may be redundant
		if (document.getElementById("xtraMenu").style.display == "none") showWarning("Please go to the hamburger menu to enter your password.")
	} else {
		var titleChanged = $("#idTitle").html () != (curr_post_details.title? curr_post_details.title: '');
		var labelsChanged = $("#idLabels").html () != (curr_post_details.labels? curr_post_details.labels.join(" "): "");
		var bodyChanged = ($("#summerEditor").summernote('code') != (curr_post_details.body? curr_post_details.body: "")) ;

		if (titleChanged || bodyChanged || labelsChanged || forceSaveAndSync) {

			if (bodyChanged) curr_post_details.body = $("#summerEditor").summernote('code');
			if (titleChanged) curr_post_details.title = $("#idTitle").html ();
			if (labelsChanged) {
				var labels = removeSpaces($("#idLabels").html ());
				if (labels.length>0) {
					curr_post_details.labels = labels.split(" ");
				} else {
					curr_post_details.labels = [];
					$("#idLabels").html("");
				}
			}
			if (!curr_post_details.created_locally) {
				curr_post_details.created_locally = new Date().getTime();
				curr_post_pointer.created_locally = curr_post_details.created_locally + 0;
			}
			curr_post_details.fj_modified_locally = new Date().getTime();
			if (bodyChanged) curr_post_details.body_changed = new Date().getTime();
			notery.save();

			showCurrentNoteStats();

			if (!curr_post_pointer.changedSinceChosen) { // move to top of list...
				curr_post_pointer.changedSinceChosen = true;
				var chosenDiv = document.getElementById('click_gotoNote_'+curr_post_pointer.section+'_'+curr_post_pointer.num+"_wrap");
				if (chosenDiv) removeDiv(chosenDiv);

				var notesList = document.getElementById('notesList');

				if (curr_post_pointer.section =="online") { // switch to local
					chosenDiv = null;
					notery.data.posts.push(JSON.parse(JSON.stringify(onlineSearch.posts[curr_post_pointer.num])));
					curr_post_pointer.section = "local";
					curr_post_pointer.num = notery.data.posts.length-1;
					chosenDiv = newListElementWithNum(curr_post_pointer.num, curr_post_pointer.section);
				} else if (!chosenDiv) {
					chosenDiv = newListElementWithNum(curr_post_pointer.num, curr_post_pointer.section);
				}
				insertDivAtBeg(notesList,chosenDiv);
				setLeftTabELementContent(curr_post_pointer.num, curr_post_pointer.section	);
				
				document.getElementById('leftBar').scrollTop = 0;
			}

			if (titleChanged || labelsChanged) setLeftTabELementContent(curr_post_pointer.num, curr_post_pointer.section)
			notery.data.local_backups_changed_since_last_save = true;
		}
	}
	if ((forceSaveAndSync || stats.syncCounter >=  SAVES_PER_SYNC) && !stats.encryptFault){
		doSyncPosts();
	} else {
		stats.syncCounter++;
	}
}
var newNote = function () {
	if  (!(
			$("#idTitle").html == "" &&
			$("#idLabels").html == "" &&
			(!$("#summerEditor").summernote('code') || $("#summerEditor").summernote('code') == "<p><br></p>") 
		 )) {saveNote();}

	$('#idSearchBox').html('');
	doSearchLocally("headers");

	var oldNoteTitle = document.getElementById('click_gotoNote_'+curr_post_pointer.section+"_"+curr_post_pointer.num+"_title");
	if (oldNoteTitle) oldNoteTitle.className = "leftBarTitle";

	curr_post_pointer.section = "local";
	curr_post_pointer.num = notery.data.posts.length;
	curr_post_pointer.changedSinceChosen = false;
	curr_post_pointer.created_locally = new Date().getTime();
	notery.data.posts.push({
		'title':null, 
		'labels':[],
		'body':null,
		'created_locally': curr_post_pointer.created_locally
	});
	showCurrentNote();

	document.getElementById("idTitle").focus();
}
var deleteCurrentNote = function() {
	if (curr_post_pointer.section!="local" ) {
		showWarning("Cannot delete a note which is not local")
	} else if (confirm('Are you sure you want to delete this note?')) { 
		var numToDel = curr_post_pointer.num + 0;

		showNextValidNote();

		var noteDivToDel = document.getElementById('click_gotoNote_local_'+numToDel+"_wrap");
		if (noteDivToDel) removeDiv(noteDivToDel);

		if (numToDel>=0 && notery.data.posts[numToDel]) {
			notery.data.posts[numToDel].fj_deleted = true;
			notery.data.posts[numToDel].title = " - deleted: "+notery.data.posts[numToDel].title;
			notery.data.posts[numToDel].fj_modified_locally = new Date().getTime();

			notery.save();
		}
		if (!stats.encryptFault) doSyncPosts();
	}
}
var gotoNote = function (num, section, fromHistory) {
	if  (!(
			$("#idTitle").html == "" &&
			$("#idLabels").html == "" &&
			(!$("#summerEditor").summernote('code') || $("#summerEditor").summernote('code') == "<p><br></p>") 
		) ) {saveNote();}
	var oldNoteTitle = document.getElementById('click_gotoNote_'+curr_post_pointer.section+"_"+curr_post_pointer.num+"_title");
	if (oldNoteTitle) oldNoteTitle.className = "leftBarTitle";

	curr_post_pointer.num = parseInt(num);
	curr_post_pointer.section = section;
	curr_post_pointer.changedSinceChosen = false;

	showCurrentNote(fromHistory);
}

freezr.app.logoutCallback = removeJlos;
var removeJlos = function() {
    notery.removeSyncedFreezrInfo("posts");
    notery.data.last_server_sync_time= 0;
	notery.data.fj_oldest_item = null;
	notery.data.freezr_user_id = null; 
	notery.data.freezr_server_address = null; 
	notery.data.freezr_app_code = null; 
	notery.data.encryptDo = false;
    notery.save();
    populateLeftPanel();
    showFirstValidNote();
}
var removeJlosAndQuit = function() {
    notery.reInitializeData();
    notery.save();
	freezr.utils.logout();
}
function post_consistent_with_current_data (post_details) {
	if (!post_details)  {
		showWarning("CONFLICT - No data sent - post_consistent_with_current_data 1");
		return false; // no postJsons!!
	} else if (post_details._id) {
		if (post_details._id != curr_post_pointer._id) showWarning("CONFLICT - id's inconsistent - post_consistent_with_current_data 2");
		return (post_details._id == curr_post_pointer._id) 
	} else if (curr_post_pointer._id) {
		showWarning("CONFLICT - post_consistent_with_current_data 3");
		return false; // can't have one with an id and not the other
	} else if (!post_details.created_locally || !curr_post_pointer.created_locally) {
		showWarning("CONFLICT - NO DATES - post_consistent_with_current_data 4");
		return false; // If not _id, then must have a localId
	} else { 
		if (post_details.created_locally != curr_post_pointer.created_locally) {showWarning("CONFLICT - local creation date inconsistent")}
		return (post_details.created_locally == curr_post_pointer.created_locally);
	}
 }


// VIEW MAIN Rendering (Show / Hide Eements)
var showCurrentNote = function(fromHistory) {
	document.getElementById("idTitle").style.display="block";
	document.getElementById("idLabels").style.display="block";
	document.getElementById("editorContainer").style.display="block";
	showWarning();

	$('#summerEditor').summernote('reset');
	initialiseEditors(); // really only to get rid of codeview and the "Undo" from grabbng last note's text, which creates problems.. also need "destroy"
	
	if ((usingMobileVersion || usingSmallScreenVersion) && document.getElementById('click_menuBackGround').style.display == "block"){toggleLeftMenu();}

	var curr_post_details = (curr_post_pointer.section== "local")? notery.data.posts[curr_post_pointer.num]: onlineSearch.posts[curr_post_pointer.num];
	if (!fromHistory && window.location.origin != "file://") history.pushState(null, null,  window.location.pathname +'?section='+curr_post_pointer.section+"&num="+curr_post_pointer.num);

	if (curr_post_pointer.num >=0 && curr_post_details && !curr_post_details.fj_deleted) {
		if (curr_post_details && curr_post_details.cipher && stats.encryptPW) { 
		// Give it a chance to try and decrypt again
			curr_post_details = decryptedPost(curr_post_details);
			if (curr_post_pointer.section== "local") {
				notery.data.posts[curr_post_pointer.num]=curr_post_details;
				notery.save();
			} else {
				onlineSearch.posts[curr_post_pointer.num]=curr_post_details;
			}
		}

		$("#idTitle").html ((curr_post_details && curr_post_details.title)? curr_post_details.title: '');
		$("#idLabels").html ((curr_post_details && curr_post_details.labels && curr_post_details.labels.length>0)? curr_post_details.labels.join(' '): '');
		
		// Sync pointers
		curr_post_pointer.created_locally = curr_post_details.created_locally +0;
		curr_post_pointer._id = curr_post_details._id;

		showCurrentNoteStats();
		var newNoteTitle = document.getElementById('click_gotoNote_'+curr_post_pointer.section+"_"+curr_post_pointer.num+"_title");
		if (newNoteTitle) newNoteTitle.className = "leftBarTitle showing"; // newNoteTitle doesnt exist for new notes

		// new pg add - to check if needed
		document.getElementById("mainDiv").focus()

		// NB aug 2016 . Moved this down from above idtitle to fix cleantext
		if (curr_post_details && curr_post_details.cipher) {
			showWarning("");
			$('#summerEditor').summernote('code','<span style="color:red">This note is encrypted. Please enter your password to see the note.</span>')
		} else {
			$('#summerEditor').summernote('code',curr_post_details.body)
			setTimeout(function() {
              	noteryCleanBody();	          	
	        },10);
		}

	} else {
		showFirstValidNote();
	}
	$('#summerEditor').summernote('recordUndo');
}
var noteryCleanBody = function() {
	bodyDiv = document.getElementsByClassName("panel-body")[0];
	cleanElementNotery(bodyDiv);
}

var showCurrentNoteStats = function() {
	var temptext="";
	var curr_post_details = curr_post_pointer.section== "local"? notery.data.posts[curr_post_pointer.num]: onlineSearch.posts[curr_post_pointer.num];
	if (curr_post_details) {
		temptext = curr_post_details.created_locally? ("Created:"+freezr.utils.longDateFormat(curr_post_details.created_locally)): "Creation: unknown";
		temptext +=  (usingSmallScreenVersion)?"&nbsp; &nbsp; ":"<br/>";
		temptext += (curr_post_pointer.section== "local" && curr_post_details.fj_modified_locally)? "Modified recently (unsynced)": (curr_post_details._date_Modified? "Last Synced: "+freezr.utils.longDateFormat(curr_post_details._date_Modified) : "");
	}
	$("#idInfo").html (temptext);	
}
var showFirstValidNote  = function () {
	var oldNoteTitle = document.getElementById('click_gotoNote_local_'+curr_post_pointer.num+"_title");
	if (oldNoteTitle) oldNoteTitle.className = "leftBarTitle";

	curr_post_pointer.section = "local";

	var theEl = document.getElementById('notesList').firstChild;
	while (theEl && theEl.style.display == "none") {
		theEl = theEl.nextSibling; 
	}

	if (theEl) {
		curr_post_pointer.num = parseInt(theEl.id.split('_')[3]);
		showCurrentNote();
	} else {
		curr_post_pointer.num = 0;
		while (curr_post_pointer.num<=onlineSearch.posts.length && (!onlineSearch.posts[curr_post_pointer.num] || onlineSearch.posts[curr_post_pointer.num].fj_deleted || !elementIsShown(curr_post_pointer.num, "online")) ) {
			curr_post_pointer.num++;
		}
		if (curr_post_pointer.num>=onlineSearch.posts.length) {
			showWarning("No Notes.");
			curr_post_pointer.num = -1;
			curr_post_pointer._id=null;
			curr_post_pointer.created_locally=null;
			hideNoteEls();
		} else {
			showCurrentNote();
		}
	}  
	document.getElementById('leftBar').scrollTop = 0;
}
var showNextValidNote  = function () {
	var oldNoteTitle = document.getElementById('click_gotoNote_local_'+curr_post_pointer.num+"_title");
	if (oldNoteTitle) oldNoteTitle.className = "leftBarTitle";

	if (oldNoteTitle && oldNoteTitle.parentNode && curr_post_pointer.section == "local" && oldNoteTitle.parentNode.nextSibling && oldNoteTitle.parentNode.nextSibling.id && oldNoteTitle.parentNode.nextSibling.id.split('_').length>3) {
			curr_post_pointer.num = oldNoteTitle.parentNode.nextSibling.id.split('_')[3];
			showCurrentNote();
	} else {
		showFirstValidNote();
	}
}
var createConflictedNote = function(copyOfExistingItem) {
	if (confirm("There was a conflict syncing your note on "+copyOfExistingItem.title+". Do you want to create a new copy of the note?") ) {
		copyOfExistingItem.created_locally = new Date().getTime();
		copyOfExistingItem.title = "COPY: "+copyOfExistingItem.title;
		copyOfExistingItem.body = "<p>COPY OF POST MADE WITH CHANGES YOU MADE LOCALLY. Other copy was downloaded from your freezr."+freezr.utils.longDateFormat(new Date().getTime())+"</p> "+copyOfExistingItem.body;
		return copyOfExistingItem;
	} else {return null}

}
var showWarning = function(msg, timing) {
	// null msg clears the message
	//onsole.log("warning "+msg)
	if (stats.warningTimeOut) clearTimeout(stats.warningTimeOut);
	if (!msg) {
		$("#warnings").html ("");
		document.getElementById('warnings').style.display="none";
	} else {
		var newText = $("#warnings").html ()
		if (newText && newText!=" ") newText+="<br/>";
		newText += msg;
		$("#warnings").html (newText);
		document.getElementById('warnings').style.display="block";
		if (timing) {stats.warningTimeOut = setTimeout(function(){ showWarning(); }, timing);}
	} 
}
var hideNoteEls = function() {
	document.getElementById("idTitle").style.display="none";
	document.getElementById("idLabels").style.display="none";
	document.getElementById("editorContainer").style.display="none";
}
var elementIsShown = function(postNum,section) {
	var theEl = document.getElementById('click_gotoNote_'+section+"_"+postNum+"_wrap");
	return (theEl && theEl.style.display != "none") 
}
// VIEW Left Panel
var populateLeftPanel = function() {
	//onsole.log("#populateLeftPanel");
	var leftBarDiv = document.getElementById('notesList');
	leftBarDiv.innerHTML ="";
	if (notery.data.posts && notery.data.posts.length>0) {
		for (var i=0; i<notery.data.posts.length; i++) {
			if (!notery.data.posts[i].fj_deleted) {
				addLeftPanelElementInDateOrder(i,"local");
			}
		}
	}
}
var addLeftPanelElementInDateOrder = function(listItemNumber, section) {
	var leftBarDiv = document.getElementById(section=="local"? 'notesList':'onlineSearchedNotesList');
	var nextPost = leftBarDiv.firstChild;
	var nextPostNum = (nextPost && nextPost.id)? nextPost.id.split('_')[3]: null;

	var noteToInsert = section=="local"? notery.data.posts[listItemNumber]:onlineSearch.posts[listItemNumber] ;
	while (nextPostNum && nextPostNum<notery.data.posts.length && getMaxLastModDate(notery.data.posts[nextPostNum]) > getMaxLastModDate(noteToInsert)) {
		nextPost = nextPost.nextSibling;
		nextPostNum = (nextPost && nextPost.id)? nextPost.id.split('_')[3]: null;
	}
	leftBarDiv.insertBefore(newListElementWithNum(listItemNumber, section), nextPost);
	setLeftTabELementContent(listItemNumber, section);
}
var newListElementWithNum = function(i, section) {
	var noteWrap, noteTitleInList, noteLabelsInList

	noteWrap = document.createElement('div');
	noteWrap.className = "noteListItem";
	noteWrap.id = 'click_gotoNote_'+section+"_"+i+"_wrap";

	noteTitleInList = document.createElement('div');
	noteTitleInList.className = "leftBarTitle" + ((section==curr_post_pointer.section && i==curr_post_pointer.num)?" showing":"");
	noteTitleInList.id= 'click_gotoNote_'+section+"_"+i+"_title";
	noteLabelsInList = document.createElement('div');
	noteLabelsInList.className = "leftBarLabels";
	noteLabelsInList.id = 'click_gotoNote_'+section+"_"+i+"_labels";
	noteDateInList = document.createElement('div');
	noteDateInList.className = "leftBarLabels";
	noteDateInList.align = "right";
	noteDateInList.id = 'click_gotoNote_'+section+"_"+i+"_date";

	noteWrap.appendChild(noteTitleInList);
	noteWrap.appendChild(noteLabelsInList);
	noteWrap.appendChild(noteDateInList);

	return noteWrap;
}
var setLeftTabELementContent = function(listIndex, section) {
	var noteTitleInList = document.getElementById('click_gotoNote_'+section+"_"+listIndex+"_title");
	var the_post = (section== "local")? notery.data.posts[listIndex]: onlineSearch.posts[listIndex];

	if (noteTitleInList) {
		noteTitleInList.innerHTML = (the_post && the_post.title)? the_post.title: "No title";
	} else {
		console.log("ERROR - NO TITLE ELEMENT FOR "+listIndex);
	}
	var noteLabelsInList = document.getElementById('click_gotoNote_'+section+"_"+listIndex+"_labels");
	if (noteLabelsInList) {
		noteLabelsInList.innerHTML = (the_post && the_post.labels && the_post.labels.length>0)? the_post.labels.join(" "): " ";
	}else {
		console.log("ERROR - NO LABEL ELEMENT FOR "+listIndex);
	}
	var noteDateInList = document.getElementById('click_gotoNote_'+section+"_"+listIndex+"_date");
	if (noteDateInList) {
		noteDateInList.innerHTML = the_post.body_changed? ("mod: "+freezr.utils.longDateFormat(the_post.body_changed) ) : (the_post._date_Modified? ("synced: "+freezr.utils.longDateFormat(the_post._date_Modified) ) : ( the_post.created_locally? (" new: "+freezr.utils.longDateFormat(the_post.created_locally))  :""));
	}
}
// VIEW Search
var toggleSearchDivs = function(what) {
	if (what=="Text") {
		document.getElementById("click_searchNowHeaders").className = "leftBarSearchButts leftbarSearchButtInactive";
		document.getElementById("click_searchNowAllText").className = "leftBarSearchButts leftbarSearchButtActive";
		document.getElementById("click_searchOnline_1").style.display="none";
	} else {
		document.getElementById("click_searchNowHeaders").className = "leftBarSearchButts leftbarSearchButtActive";
		document.getElementById("click_searchNowAllText").className = "leftBarSearchButts leftbarSearchButtInactive";
		document.getElementById("click_searchOnline_1").style.display="block";
	}
}
// VIEW Extra Menu and password related
var xtraMenuToggle = function(doClose) {
	showWarning();

	if (!doClose) {
		document.getElementById('xtraMenu').style.display = "block"; 

		if (isMobile()) document.getElementById('topBar2').style["-webkit-transform"] = "translate3d(0, 0px, 0)";


		document.getElementById("xtras_openFreezrToLogin").style.display =(!freezr.app.isWebBased && !notery.data.freezr_user_id)? "block":"none";

		document.getElementById("xtras_currentNoteDelDiv").style.display="block";
		document.getElementById("xtras_deleteDataDiv").style.display= notery.saveLS()? "block":"none";
		document.getElementById('xtrasBackupSection').style.display = usingMobileVersion? "none":"inline-block";
		document.getElementById('click_xtraMenuClose_0').style.display = "inline-block";
		document.getElementById('click_xtraMenuClose_1').style.display = "inline-block";
		document.getElementById('click_xtraMenuClose_2').style.display = "inline-block";
		document.getElementById('click_xtraMenuClose_3').style.display = "inline-block";
		document.getElementById('click_savePassword_1').style.display = "inline-block";

		document.getElementById("xtras_encyptOuter").style.display = notery.data.freezr_user_id?"block":"none";
		document.getElementById('encPassword_1').innerHTML = "";
		document.getElementById('encPassword_2').innerHTML = "";
		document.getElementById("xtras_passwordRadio").style.display = ((stats.encryptPW || notery.data.encryptDo) && notery.saveLS())? "block":"none";
		document.getElementsByName("keepPasswordOnDevice")[(((stats.encryptPW || notery.data.encryptDo) && !notery.data.encryptPW)? 1:0)].checked = true;
		
		if (curr_post_pointer.section!="local" ) {
			document.getElementById("xtras_currentNoteDelDiv").style.display ="none";
		} else if (notery.data.posts[curr_post_pointer.num].title) { 
			document.getElementById("xtras_currentNote").innerHTML =  'entitled "' +notery.data.posts[curr_post_pointer.num].title+'"';
		} else {
			document.getElementById("xtras_currentNote").innerHTML = "with no title"
		}
		if (notery.data.local_backups_do) {document.getElementById("saveMinutes").innerHTML = parseInt(notery.data.local_backup_interval/(60*1000) );}
		var storage = notery.getSpaceUsed();
		if (storage && storage.total) {
			document.getElementById("xtras_storageDiv").style.display="block";
			document.getElementById("xtras_ttl_st").innerHTML = Math.round((100*(storage.total)/5000));
			document.getElementById("xtras_noteryPc").innerHTML = Math.round((100*storage.this/storage.total));
		} else {document.getElementById("xtras_storageDiv").style.display="none";}
		document.getElementById("xtraMenuPwdEnter_2").style.display="none";
		if (notery.data.encryptDo || stats.encryptFault) {
			// nownow
			document.getElementById("xtraMenuEncIsOn").style.display = "";
			document.getElementById("xtraMenuEncIsOff_1").style.display = "none";
			document.getElementById("xtraMenuEncIsOff_2").style.display = "none";
			document.getElementById("xtraMenuEncPwdNeeded").style.display = stats.encryptPW? "none":"block";
			document.getElementById("xtraMenuPwdEnter_1").style.display = stats.encryptPW? "none":"block";
		} else { // ENc is OFF
			document.getElementById("xtraMenuEncIsOn").style.display = "none";
			document.getElementById("xtraMenuEncIsOff_1").style.display = "";
			document.getElementById("xtraMenuEncIsOff_2").style.display = "block";
			document.getElementById("xtraMenuEncPwdNeeded").style.display = "none";
			document.getElementById("xtraMenuPwdEnter_1").style.display = "block";
		}
		setTimeout(function(){
			document.getElementById('mainDiv').style.display ="none";
			hideLeftMenu();
		},500 )


	} else {
		document.getElementById('mainDiv').style.display ="block";

		if (stats.encryptPW && document.getElementsByName("keepPasswordOnDevice")[0].checked) {
			savePasswordinJlos(true);
		} else {
			savePasswordinJlos(false);
		}
		setTimeout(function(){
			document.getElementById('xtraMenu').scrollTop = 0;
			document.getElementById('xtraMenu').style.display = "none";
		},400 )
	}
	setTimeout(function(){
		document.getElementById('xtraMenu').style["-webkit-transform"] = doClose? "translate3d(-"+(Math.max(window.innerWidth,window.innerHeight)+50)+"px, 0, 0)":"translate3d(0, 0, 0)";
	},10 )
}
var savePasswordNextStep  = function(stepOne) {
	if (stepOne && notery.data.encryptDo && !stats.encryptPW) { 
		if (document.getElementById("encPassword_1").innerHTML!="") {
			if (nowSavePassword(document.getElementById("encPassword_1").innerHTML,false) ) {
				doClick(["click","xtraMenuClose"]);
				decryptAllPosts();
				showCurrentNote();
			} else {
				showWarning("INCORRECT password")
			}
		} else {
			showWarning("No password enterred.",4000)
		}
	} else if (stepOne) {
		xraMenuHideAllExceptEnc();
		document.getElementById('click_savePassword_1').style.display = "none";
		document.getElementById("xtras_passwordRadio").style.display =  notery.saveLS()?"block":"none";
		document.getElementById('xtraMenuPwdEnter_2').style.display = "block";
		setTimeout(function(){document.getElementById('xtraMenu').scrollTop = 104},40);
	} else { // second Step
		if (document.getElementById("encPassword_1").innerHTML=="") {
			showWarning("No password enterred.",4000)
		} else if (document.getElementById("encPassword_1").innerHTML!=encPassword_2.innerHTML) {
			showWarning("Passwords do not match",4000);
		} else if (!document.getElementsByName("forgettingPword")[2].checked){
			showWarning("Please read the options carefully, and remember your password before proceeding.",4000)
		} else {
			nowSavePassword(document.getElementById("encPassword_1").innerHTML, true);
			doClick(["click","xtraMenuClose"]);
		}
	}
}
var reenterPWord = function() {
	xtraMenuToggle(false);
	xraMenuHideAllExceptEnc();
	document.getElementById('click_savePassword_1').style.display = "";
	document.getElementById('xtraMenuPwdEnter_2').style.display = "none";
	setTimeout(function(){document.getElementById('encPassword_1').focus();},600)
}
var xraMenuHideAllExceptEnc = function() {
		document.getElementById("xtras_currentNoteDelDiv").style.display="none";
		document.getElementById("xtras_storageDiv").style.display="none";
		document.getElementById("xtras_deleteDataDiv").style.display="none";
		document.getElementById('xtrasBackupSection').style.display = "none";
		document.getElementById('click_xtraMenuClose_0').style.display = "none";
		document.getElementById('click_xtraMenuClose_1').style.display = "none";
		document.getElementById('click_xtraMenuClose_2').style.display = "none";
		document.getElementById('click_xtraMenuClose_3').style.display = "none";
}


// Mobile / Desktop / resizing
var usingMobileVersion = true, usingSmallScreenVersion = true;
var isMobile = function() {
	//
	return  (/iPhone|iPod|Android/.test(navigator.userAgent) && !window.MSStream);
}
var isSmallScreen = function() {
	//
	return (Math.max(window.innerWidth)<500);
}
var isPortrait = function() {
	return (window.innerWidth < window.innerHeight)
}
var hasiPhoneHeader = function () {
	// isPortait is : new pg add - to check
	return (!freezr.app.isWebBased && /iPhone|iPod|iPad/.test(navigator.userAgent) && isPortrait())
}
var setMobileVersion = function(force) {
	// get mobileversion from screen size
	if (!force && usingMobileVersion==isMobile() && usingSmallScreenVersion==isSmallScreen()) {
		//onsole.log("do nothing ")	
	} else {
		usingSmallScreenVersion=isSmallScreen();
		usingMobileVersion = isMobile();

		usingSmallOrMobile = (usingSmallScreenVersion || usingMobileVersion);

		if (!usingSmallOrMobile) {
			if (document.getElementById('click_menuBackGround').style.display == "block") toggleLeftMenu();
		} else {
			document.getElementById('click_menuBackGround').style.display = "block";
			toggleLeftMenu();	
		}
		document.getElementById('leftBar').className = ("leftBar" + (usingSmallOrMobile? "Mobile":"Desktop"));
		document.getElementById('topBar').className = "topBar_" + (usingMobileVersion? ("Mobile" + (hasiPhoneHeader()? "_Header" :"") ) : ("Desktop" + (usingSmallOrMobile?"_small":"" ) ) ) ;
		document.getElementById('topBar2').className = "topBar_" + (usingMobileVersion? "Mobile":"Desktop") + (hasiPhoneHeader()? "_Header" :"");
		document.getElementById('click_syncNow_0').className = document.getElementById('click_syncNow_0').className.replace(usingSmallOrMobile? "Desktop":"Mobile",usingSmallOrMobile? "Mobile":"Desktop");
		document.getElementById('click_syncNow_1').style.display = usingSmallOrMobile? "none":"inline-block";
		document.getElementById('click_newNote_0').className = document.getElementById('click_newNote_0').className.replace(usingSmallOrMobile? "Desktop":"Mobile",usingSmallOrMobile? "Mobile":"Desktop");
		document.getElementById('click_xtraMenuSlider_0').className = document.getElementById('click_xtraMenuSlider_0').className.replace(usingSmallOrMobile? "Desktop":"Mobile",usingSmallOrMobile? "Mobile":"Desktop");
		document.getElementById('click_newNote_1').style.display = usingSmallOrMobile? "none":"inline-block";
		document.getElementById('click_xtraMenuSlider_1').style.display = usingSmallOrMobile? "none":"inline-block";
		document.getElementById('idTitle').className = "oneliner title_" + (usingMobileVersion? "Mobile":("Desktop"+(usingSmallOrMobile?"_small":"") ) );
		document.getElementById('idLabels').className = "oneliner label_" + (usingMobileVersion? "Mobile":("Desktop"+(usingSmallOrMobile?"_small":"") ) );
		document.getElementById('warnings').className = "warnings_" + (usingSmallOrMobile? "Mobile":"Desktop");
		document.getElementById('editorContainer').className = "editor_" + (usingMobileVersion? "Mobile edTextSize_large":(usingSmallScreenVersion? "SmallDesktop edTextSize_medium" : "Desktop edTextSize_small"));
		document.getElementById('idInfo').className = usingMobileVersion? "info_Mobile":(usingSmallScreenVersion?"info_DesktopSmallScreen" :"info_Desktop");
		document.getElementById('searchOuter').className = usingSmallOrMobile? "searchOuter_Mobile":"searchOuter_Desktop";
		document.getElementById('click_topLogo').src = usingSmallOrMobile? "static/Notery_N_v1.png":"static/Notery_Logo_v2.png";
		if (hasiPhoneHeader()) document.getElementById("click_topLogo").style.top="20px";
		bodyDiv = document.getElementsByClassName("panel-body")[0];
		if (bodyDiv) {bodyDiv.style.paddingTop = usingSmallOrMobile? "50px":"0px";} 

		document.getElementById("menuInner").className = isSmallScreen? "xtraMenu_Mobile":"";
	}
	if (usingSmallScreenVersion) {
		var margin = parseInt((window.innerWidth-140)/8);
		document.getElementById('click_xtraMenuSlider_0').style.marginLeft=margin+"px";
		document.getElementById('click_syncNow_0').style.marginLeft=margin+"px";
		document.getElementById('click_newNote_0').style.marginLeft=margin+"px";
	}

	document.getElementById('editorContainer').className = document.getElementById('editorContainer').className.replace(usingMobileVersion?  "small":"large" ,usingMobileVersion? "large":"small");

	initialiseEditors(); 
}
var hideLeftMenu = function() {
	//
	if (document.getElementById('click_menuBackGround').style.display=="block") toggleLeftMenu();
}
var toggleLeftMenu = function () {
	var hideMenu = document.getElementById('click_menuBackGround').style.display=="block"; 

	document.getElementById('leftBar').style["-webkit-transform"] = hideMenu? "translate3d(0, 0, 0)":"translate3d(250px, 0, 0)";
	if (isMobile()) document.getElementById('topBar').style["-webkit-transform"] = (hideMenu)? "translate3d(0, -50px, 0)":"translate3d(0, 0, 0)";
	document.getElementById('click_menuBackGround').style.display = hideMenu? "none" : "block";
	if (hideMenu) window.scrollTop = 0;
	var editorDivList = document.getElementsByClassName("note-editing-area");
	if (editorDivList.length>0) editorDivList[0].style.height = hideMenu? null:((window.innerHeight-editorDivList[0].offsetTop-50)+"px");
	document.getElementById("idInfo").style.display= hideMenu? "block":"none";
}
window.onresize = function(event) {
	//
    setMobileVersion();
};

// Syncing Callbacks
var doSyncPosts = function () {
	//onsole.log("doSyncPosts");
	clearInterval(stats.localSaveIntervaler); stats.localSaveIntervaler=null;
	if (!freezr.app.isWebBased && !freezr_app_code) {
		document.getElementById("click_syncNow_0").className = document.getElementById("click_syncNow_0").className.replace("fa fa-spin fa-refresh topBut","fa fa-refresh clickable topBut");
	} else if (stats.encryptFault) {
		console.log("error: cant sync with bad password");
	} else if (!stats.syncInProgress) {
		//onsole.log("going to sync "+freezr_server_address+" alreadySyncedOnce:"+stats.alreadySyncedOnce);
		stats.syncCounter = 1;
		stats.syncInProgress = true;
		notery.sync("posts", {
			gotNewItemsCallBack: syncGotNewPosts, 
			warningCallBack: syncWarningCB,
			uploadedItemTransform: encryptedPost,
			downloadedItemTransform: decryptedPost,
			uploadedItemCallback: syncUploadedItemCB,
			endCallBack: stats.alreadySyncedOnce? syncEndCB: firstSyncEndCB,
			doNotCallUploadItems: false,
			numItemsToFetchOnStart: NUM_NOTES_TO_DOWNLOAD});
	} else {
		console.log("error -syncing already in progress");
	}
};
var clickedToSyncPosts = function() {
	if (!freezr.app.isWebBased && !freezr_app_code) {
		document.getElementById("click_syncNow_0").className = document.getElementById("click_syncNow_0").className.replace("fa fa-spin fa-refresh topBut","fa fa-refresh clickable topBut");
		freezr.html.freezrMenuOpen();
	} else if (stats.encryptFault) {
		showWarning("Please enter your password to sync.",3000)
		reenterPWord();
	} else {
		doSyncPosts();
	}
}
var syncGotNewPosts = function(newPosts, changedPosts) {
	//onsole.log("GOT changedPosts "+changedPosts.length+" GOT newPosts "+newPosts.length);
	newPosts.forEach(function (aPost ){
		resultIndex = notery.idIndex("posts", aPost, true);
		addLeftPanelElementInDateOrder(resultIndex, "local");
	});
	changedPosts.forEach(function (aPost ){
		resultIndex = notery.idIndex("posts", aPost, false)
		var noteDiv = document.getElementById('click_gotoNote_local_'+resultIndex+"_wrap");
		if (noteDiv) removeDiv(noteDiv);
		if (aPost.fj_deleted) {
			if (curr_post_pointer.section=="local" && curr_post_pointer.num == resultIndex) {showFirstValidNote();}
		} else {
			addLeftPanelElementInDateOrder(resultIndex,"local");
			if (resultIndex == curr_post_pointer.num && curr_post_pointer.section == "local") showCurrentNote();
		}
	});
}
var syncWarningCB = function(msgJson) {
	console.log("WARNING message "+msgJson.status+" size "+msgJson.item.body.length) 
	if (msgJson && msgJson.msg) {
		var warnTime = (msgJson.error && msgJson.error=="no connection")? 1000:5000;
		if (msgJson.error && msgJson.error == "post transform error") {msgJson.msg="There was a problem encypting your post. Syncing is being stopped."}
		if (msgJson && msgJson.status==413) {
			msgJson.msg="Your message is too big to be synced to your current freezr. Please delete part of it (specially pictures if you ave them (or reduce the size of pictures)"
		}
		showWarning("warning "+msgJson.msg, warnTime);
	} else {
		showWarning("inernal Error", 5000);
	}
	stats.syncInProgress = false;
}
var syncUploadedItemCB= function(listItemNumber) {
	if (curr_post_pointer.section=="local" && listItemNumber == curr_post_pointer.num) {
		curr_post_pointer._id = notery.data.posts[curr_post_pointer.num]._id
		showCurrentNoteStats();
	}
}
var syncEndCB = function(aMsg) {
	//onsole.log("end Sync with "+JSON.stringify(aMsg))
	stats.syncInProgress = false;
	document.getElementById("click_syncNow_0").className = document.getElementById("click_syncNow_0").className.replace("fa fa-spin fa-refresh topBut","fa fa-refresh clickable topBut");
	if (aMsg && aMsg.error && aMsg.status==401) {
		showWarning("Your login credentials have expired. Please login again.", 5000);
		window.open("/account/login/autoclose",null);
	} 
}
var firstSyncEndCB = function(aMsg) {
	//onsole.log("end firstSyncEndCB with "+JSON.stringify(aMsg))
	stats.syncInProgress = false;
	stats.alreadySyncedOnce = true;
	wrapUpTryingToSync();
}
var wrapUpTryingToSync = function() {
	document.getElementById("click_syncNow_0").className = document.getElementById("click_syncNow_0").className.replace("fa fa-spin fa-refresh topBut","fa fa-refresh clickable topBut");
	document.getElementById("searchOuter").style.display="block";
	document.getElementById("click_searchOnline_1").style.display="block";
	if (notery.data.posts.length==0) {
		newNote();
	} else {
		showFirstValidNote();
	}
	// new pg add - to check
	if (stats.encryptFault) {
		notery.data.encryptDo = true;
		stats.encryptPW = null;
		notery.data.encryptPW = null;
		reenterPWord();
	} else if (notery.data.encryptDo && !stats.encryptPW) {
		reenterPWord();
	}
	if (freezr.app.isWebBased && usingMobileVersion) {
		setTimeout(toggleLeftMenu,10);
	}
}

// SEARCH
var doSearchLocally = function(what) {
	if (!what) what = document.getElementById("click_searchNowAllText").className=="leftBarSearchButts leftbarSearchButtActive"? "allText":"headers";	
	showWarning();

	var elementsToKeep = [];
	var wordsToFind = removeSpaces(document.getElementById("idSearchBox").textContent).toLowerCase();
		wordsToFind = (wordsToFind.length>0)? wordsToFind.split(" "): [];

	document.getElementById('click_clearSearch').style.display = (wordsToFind && wordsToFind.length>0)? "block":"none";
	
	for (var i = 0; i<notery.data.posts.length; i++) {
		if (!notery.data.posts[i].fj_deleted) {
			if (wordsToFind && wordsToFind.length>0) {
				var gotHit = true;
				for (j=0;j<wordsToFind.length;j++) {	
					if (gotHit && (
						(what== "headers" && notery.data.posts[i].labels && notery.data.posts[i].labels.length>0 && notery.data.posts[i].labels.join(" ").toLowerCase().indexOf(wordsToFind[j])>=0)  ||
						(what== "headers" && notery.data.posts[i].title  && notery.data.posts[i].title.length >0 && notery.data.posts[i].title.toLowerCase().indexOf(wordsToFind[j])>=0 )  ||
						(what== "allText" && notery.data.posts[i].body   && notery.data.posts[i].body.length >0  && notery.data.posts[i].body.toLowerCase().indexOf(wordsToFind[j])>=0  ) 
					   ) ) {
						gotHit = true;
					} else {gotHit = false;} 
				}
				if (gotHit) elementsToKeep.push(i);
			} else if (wordsToFind.length==0){
				elementsToKeep.push(i);
			}
		}
	}
	
	var theEL = document.getElementById('notesList').firstChild;
	var theElNum;
	while (theEL) {
		theElNum = parseInt(theEL.id.split('_')[3]);
		theEL.style.display = elementsToKeep.indexOf(theElNum)>=0? "block":"none";
		theEL = theEL.nextSibling; 
	}

	if (!isSmallScreen()) showFirstValidNote();

	onlineSearch = onlineSearchInit();
	document.getElementById("onlineSearchedNotesList").innerHTML=" ";
	document.getElementById("click_searchOnline_1").style.display = "block";
	document.getElementById("click_takeOffline_1").style.display = "none";
	document.getElementById("click_importToPosts_2").style.display = "none";
}
var onlineSearchInit = function() {
	return {posts:[], 
			COUNT:20, 
			noMoreLeft:false, 
			what:null,
			wordsToFind:[],
			last_retrieved:(notery && notery.data && notery.data.fj_oldest_item? notery.data.fj_oldest_item:new Date().getTime())};
}
var onlineSearch = onlineSearchInit();
var doSearchOnline = function(what) {
	if (!what) what = document.getElementById("click_searchNowHeaders").style.display=="none"? "allText":"labels";
	
	var wordsToFind = removeSpaces(document.getElementById("idSearchBox").textContent);
	wordsToFind = (wordsToFind.length>0)? wordsToFind.toLowerCase().split(" "): [];

	onlineSearch.what = what;
	onlineSearch.wordsToFind = wordsToFind;

	var queryOptions = {
		collection:"posts",
		count:onlineSearch.COUNT,
		query_params: 
			{$and: [ {$or:[{fj_deleted:null},{fj_deleted:false}]}
					,{'_date_Modified':{'$lt':onlineSearch.last_retrieved}} 
					] }
	}

	if (wordsToFind.length==1) {
		queryOptions.query_params.$and.push({headers:wordsToFind[0]});
	} else if (wordsToFind.length>1){
		var wordsToFindQueryList = []
		wordsToFind.forEach(function(aWord) {
			wordsToFindQueryList.push({headers:aWord})
		});
		queryOptions.query_params.$and.push({$and:wordsToFindQueryList});
	}

	showWarning();
	if (!freezr_user_id) {
		showWarning("Please log in to your freezr to fetch your online notes. (Click upper right logo)");
	} else {
		freezr.db.query (
			function(returnJson) {
				returnJson = freezr.utils.parse(returnJson);
				if (returnJson && returnJson.results && returnJson.results.length>0) {
					onlineSearch.noMoreLeft = (returnJson.results.length < onlineSearch.COUNT);
					returnJson.results.forEach(function (aResult){
						if (notery.idIndex("posts",aResult, false)<0) {
							onlineSearch.posts.push(JSON.parse(JSON.stringify(aResult)));
							addLeftPanelElementInDateOrder(onlineSearch.posts.length-1,"online");
							document.getElementById("click_takeOffline_1").style.display = "block";
						}
						if(!onlineSearch.last_retrieved || onlineSearch.last_retrieved>aResult._date_Modified) {onlineSearch.last_retrieved=aResult._date_Modified}
					} );
				} else {
					onlineSearch.noMoreLeft = true;
					showWarning("No more items found online.",2000)
				}
				document.getElementById("click_searchOnline_1").style.display = onlineSearch.noMoreLeft? "none":"block";
			},
			null, queryOptions
		);
	}
}


// OTHER - Backups, online area
var offlineLoginCallback = function(jsonResp){
	//onsole.log("GOT offlineLoginCallback CALLBACK "+JSON.stringify(jsonResp));
	if (jsonResp.error) {
		showWarning("Could not log you in - "+jsonResp.error,3000);
	} else {
		notery.data.freezr_user_id = freezr_user_id;
		notery.data.freezr_server_address = freezr_server_address;
		notery.data.freezr_app_code = freezr_app_code;
		notery.data.freezr_user_is_admin = freezr_user_is_admin;
		doSyncPosts();
	}
}
var doLocalBackUp = function(forceSave) {
	now = new Date().getTime();
	//onsole.log("doLocalBackUp "+notery.data.local_backups_last_save+" diff "+(now - notery.data.local_backups_last_save) );
	if (!isMobile() && (notery.data.local_backups_do || forceSave)) {
		if (forceSave || !notery.data.local_backups_last_save || (notery.data.local_backups_changed_since_last_save && (now - notery.data.local_backups_last_save > notery.data.local_backup_interval) ) ){
			// do backup
			var jsontext = JSON.parse(JSON.stringify(notery.data));
			if (onlineSearch && onlineSearch.posts && onlineSearch.posts.length>0) {
				jsontext.posts = jsontext.posts.concat(onlineSearch.posts);
			}
			var text = JSON.stringify(jsontext);
 			var filename = "notery backup for "+freezr_user_id+" "+(new Date().getTime())+".json";
			var blob = new Blob([text], {type: "text/plain;charset=utf-8"});
  			saveAs(blob, filename);
  			notery.data.local_backups_last_save = now;
  			notery.data.local_backups_changed_since_last_save = false;
  			notery.save();
		}
	}
}
var saveIntervals = function() {
	var theInterval = parseInt(document.getElementById("saveMinutes").innerHTML);
	clearInterval(stats.local_backup_timer);
	if (theInterval) {
		notery.data.local_backups_do = true;
		notery.data.local_backup_interval = theInterval*60*1000;
		stats.local_backup_timer = self.setInterval (doLocalBackUp, notery.data.local_backup_interval );
	} else {
		notery.data.local_backups_do = false;
	}
	document.getElementById('click_saveIntervals_1').className = document.getElementById('click_saveIntervals_1').className.replace("clickable","notClickingDummy");
	notery.save();
}
var viewBackUpNotes = function() {
	onlineSearch = onlineSearchInit();
	document.getElementById("onlineSearchedNotesList").innerHTML=" ";
	document.getElementById("click_takeOffline_1").style.display = "none";

	var files = document.getElementById("fileUploader").files;
	var posts = []
	if (!files || files.length == 0) {
		document.getElementById("fileErrs").innerHTML = "Please choose a file to import";
	} else {
		var reader = new FileReader();
			file = files[0];
			// to add multiple file capability
			if (file) {
			    reader.readAsText(file, "UTF-8");
			    reader.onload = function (evt) {
			    	var fileJson = JSON.parse(evt.target.result);
			    	if (fileJson && fileJson.posts) {
			    		posts = fileJson.posts } 
			    	else if (fileJson && fileJson.collections && fileJson.collections.length > 0 && fileJson.collections[0].name && fileJson.collections[0].name == "posts") {
			    		posts = fileJson.collections[0].data
			    	}
			    	if (posts && posts.length>0) {
			    		// needs more error checking
					    posts.forEach(function (aPost){
							delete aPost._id;
							delete aPost._date_Modified;
							delete aPost._creator;
							if (!aPost.fj_modified_locally) {aPost.fj_modified_locally = 1;} // to enable upload
							onlineSearch.posts.push(JSON.parse(JSON.stringify(aPost)));
							addLeftPanelElementInDateOrder(onlineSearch.posts.length-1,"online");
						} );
						xtraMenuToggle(true);
						document.getElementById("click_clearSearch").style.display = "block";
						document.getElementById("click_importToPosts_2").style.display = "block";
						document.getElementById("click_searchOnline_1").style.display = "none";

			    	} else {
			    		document.getElementById("fileErrs").innerHTML = "No posts found in file";
			    	}
			    }
			    reader.onerror = function (evt) {
			        document.getElementById("fileErrs").innerHTML = "error reading file";
			    }
			}
	}
}
var takeOnlineNotesOffline = function(existsOnline) {
	// check storage capability and warn if too low
	
	var moveBackOldestDate = (onlineSearch.what == "labels" && onlineSearch.wordsToFind.length == 0);

	var now = new Date().getTime();

	onlineSearch.posts.forEach(function (aPost) {
		// note - it is assumed that this list doesnt contain duplicates - should error check with idindex
		aPost.fj_modified_locally = existsOnline? null: now;
		notery.data.posts.push(JSON.parse(JSON.stringify(aPost)));
		addLeftPanelElementInDateOrder(notery.data.posts.length-1, "local");
		if (moveBackOldestDate && aPost._date_Modified) notery.data.fj_oldest_item = Math.min(notery.data.fj_oldest_item, aPost._date_Modified);
	});

	notery.save();

	showFirstValidNote();
	
	onlineSearch = onlineSearchInit();
	document.getElementById("onlineSearchedNotesList").innerHTML=" ";
	document.getElementById("click_searchOnline_1").style.display = "block";
	document.getElementById("click_takeOffline_1").style.display = "none";
	document.getElementById("click_importToPosts_2").style.display = "none";
}
var cleanAndReorderNotesList = function() {
	var TIME_TO_HOLD_DELETED_ITEMS = 1000*60*60*24*2; // 2 days
	var TIME_TO_HOLD_ARCHIVED_ITEMS = 1000*60*60*24*1; // 5 days
	var newOldest = new Date().getTime();
	for (var i=notery.data.posts.length; i>0; i--) {
		if(notery.data.posts[i-1].fj_deleted && !notery.data.posts[i-1].fj_modified_locally && notery.data.posts[i-1]._date_Modified && (new Date().getTime())-notery.data.posts[i-1]._date_Modified>TIME_TO_HOLD_DELETED_ITEMS) {
			notery.data.posts.splice(i-1,1);
		} else if (!notery.data.posts[i-1].fj_modified_locally && notery.data.posts[i-1]._date_Modified && (new Date().getTime())-notery.data.posts[i-1]._date_Modified>TIME_TO_HOLD_ARCHIVED_ITEMS) {
			notery.data.posts.splice(i-1,1);
			// todo - change so that it is not time based, but based on storage capacity
		} else {
			newOldest = Math.min(newOldest, notery.data.posts[i-1]._date_Modified? notery.data.posts[i-1]._date_Modified:newOldest);
		}
	}
	notery.data.fj_oldest_item = newOldest;
	notery.save();
	notery.data.posts.sort(sortBylastModDate);
	notery.save();

	onlineSearch = onlineSearchInit();
	
	populateLeftPanel();
	showFirstValidNote();

	document.getElementById("click_searchOnline_1").style.display = "block";

	xtraMenuToggle(true);
}

// Encryption
var nowSavePassword = function(thePassword, firstTimeSetting) {
	if (!notery.data.freezr_user_id) return false;
	if (!firstTimeSetting) {
		if (notery.data.encryptCipherTest) {
			if (!doCipherTest(thePassword)) {
				stats.encryptFault = true;
				return false;
			}
		}
	} else {
		createCipherTest(thePassword);
		notery.data.encryptDo=true;
		notery.save();
	}
	stats.encryptPW = thePassword+"";
	stats.encryptFault = false;
	return true;
}
var createCipherTest = function (thePassword) {
	//
	notery.data.encryptCipherTest = sjcl.encrypt(thePassword,"test");
}
var doCipherTest = function(aPassword) {
	try {
		var test = sjcl.decrypt(aPassword,notery.data.encryptCipherTest)
		return true;
	} catch(e) {
		return false
	}
}
var savePasswordinJlos = function(doSave) {
	notery.data.encryptPW= doSave? (stats.encryptPW+"") : null; 
	notery.save();
}
var encryptedPost = function(aPost) {
	aPost = JSON.parse(JSON.stringify(aPost));
	if (!notery.data.encryptHeaders || !notery.data.encryptDo) {
		aPost.headers = ( ( (aPost.labels && aPost.labels.length>0)? (aPost.labels.join(" ")+" "):"")+((aPost.title && aPost.title.length>0)? aPost.title:"") ).toLowerCase();
		aPost.headers = aPost.headers.split(" ");
	}
	if (notery.data.encryptDo && stats.encryptPW) {
		var encrypted_parts = {body:aPost.body};
		if (notery.data.encryptHeaders) {
			encrypted_parts.labels = aPost.labels;
			encrypted_parts.title = aPost.title;
			aPost.labels = null;
			aPost.title = null;
		}
		aPost.cipher = sjcl.encrypt(stats.encryptPW, JSON.stringify(encrypted_parts) );
		aPost.body= null;
	} else if (notery.data.encryptDo) {
		throw ("no password - cannot encrypt");
	} 
	return aPost
}
var decryptedPost= function(aPost) {
	// note: Potential bug here if somehow multiple passwords have been used for encryption (which shouldnt happen)
	//onsole.log("decripting post "+aPost.title);
	aPost = JSON.parse(JSON.stringify(aPost));
	if (aPost.cipher) {
		if (stats.encryptPW) {
			var decrypted_parts=null;
			var gotErr = false;
			try {
				decrypted_parts = JSON.parse( sjcl.decrypt(stats.encryptPW, aPost.cipher) );
			} catch(e) {
				stats.encryptPW = null;
				stats.encryptFault = true;
				gotErr = true;
			}
			if (!gotErr) {			
				aPost.body = decrypted_parts.body;
				aPost.title = decrypted_parts.title || aPost.title;
				aPost.labels = decrypted_parts.labels || aPost.labels;
				delete aPost.cipher;
				stats.encryptFault = false;
				if (!notery.data.encryptCipherTest) createCipherTest(stats.encryptPW);
			}
		} else {
			stats.encryptPW = null;
			stats.encryptFault = true;
			notery.data.encryptCipherTest = null;
		}	
	}
	return aPost;
}
var decryptAllPosts = function() { 
	var post_details, didDecrypt = false;
	if (notery.data.posts && notery.data.posts.length>0) {
		for (var i=0; i<notery.data.posts.length; i++){
			if (notery.data.posts[i].cipher) {
				notery.data.encryptDo = true;
				try {
					notery.data.posts[i] = decryptedPost(notery.data.posts[i]);
					didDecrypt = true;
				} catch(e) {
					stats.encryptFault = true;
				}
				if (!stats.encryptFault && !notery.data.encryptCipherTest) {createCipherTest(stats.encryptPW)}
			} 
		}
	}
	if (didDecrypt) notery.save();
}

// Generic utilities

	function removeSpaces(aText) {
		aText = aText.replace(/&nbsp;/g," ").trim();
		while (aText.indexOf("  ")>-1) {
			aText = aText.replace(/  /," ");
		}
		return aText;
	}
	function onlineStatus() {
		var networkState;
		if (navigator.connection && navigator.connection.type) {
			networkState = navigator.connection.type;
			
			var states = {};
			states[Connection.UNKNOWN]  = 'Unknown connection';
			states[Connection.ETHERNET] = 'Ethernet connection';
			states[Connection.WIFI]     = 'WiFi connection';
			states[Connection.CELL_2G]  = 'Cell connection';
			states[Connection.CELL_3G]  = 'Cell connection';
			states[Connection.CELL_4G]  = 'Cell connection';
			states[Connection.NONE]     = null;

			return states[networkState];
		} else {
			return null;
		}
	}
	function insertDivAtBeg(parentNode,newNode){
		if (parentNode.firstChild) {
			parentNode.insertBefore(newNode,parentNode.firstChild)
		} else {
			parentNode.appendChild(newNode)
		}
	}
	function removeDiv(aDiv) {
		if (aDiv && aDiv.parentNode) {
			aDiv.parentNode.removeChild(aDiv);
		}
	}
	function sortBylastModDate(obj1,obj2) {
		//
		return getMaxLastModDate(obj2) - getMaxLastModDate(obj1);
	}
	function getMaxLastModDate(obj) {
		//onsole.log("getMaxLastModDate obj is "+JSON.stringify(obj));
		if (!obj) {
			return 0;
		} else if (obj.body_changed) {
			return obj.body_changed;
		} else if (obj._date_Modified){
			return obj._date_Modified;
		} else if (obj.fj_modified_locally){
			return obj.fj_modified_locally;
		} else {
			return 0; // error
		}
	}

    var cleanElementNotery = function(anEl) {
      var aChild = anEl.firstChild
       //onsole.log("cleanElementNotery called on "+anEl.id +"of tag "+anEl.tagName+" with child of tagname "+(aChild?(aChild.tagname + " type "+aChild.nodeType):"no child") )
      while (aChild ) {
        //onsole.log("cleaning "+aChild.tagName+" node type is "+aChild.nodeType);
        if (aChild.nodeType==3){
          aChild=aChild.nextSibling;
        } else if ((aChild.tagName && ["meta","META","style","STYLE","XML","head","link","o"].indexOf(aChild.tagName) > -1) || aChild.nodeType==8)  {
          var oldChild = aChild;
          aChild=aChild.nextSibling;
          oldChild.parentNode.removeChild(oldChild);
        } else {
          var styleTags = [];
          ["color","background-color","font-weight", "font-style", "text-decoration","width"].forEach(function(aStyle) {
            if (aChild.style[aStyle] && aChild.style[aStyle]!="" && aChild.style[aStyle]!="normal" && aChild.style[aStyle]!="rgb(0, 0, 0)") styleTags.push([aStyle,aChild.style[aStyle]]);
          });
          var attributesToKeep = ["created"];
          if (aChild && aChild.attributes && aChild.attributes.length>0) {
            for (var i=0; i<aChild.attributes.length; i++) {
                var anAttr = aChild.attributes[i];
                if (attributesToKeep.indexOf(anAttr.name) <=0)  {
                  if (anAttr.name=="class") {
                  	aChild.className=""
                  } else if (anAttr.name=="width" && aChild.tagName=="img") {
                  	//onsole.log("do nothing")
                  } else {aChild.removeAttribute(anAttr)};
                }
            }
          }
          aChild.style = null;
          styleTags.forEach(function(aStyleArray) {if (aStyleArray[1]) aChild.style[aStyleArray[0] ]= aStyleArray[1] });
          cleanElementNotery(aChild)
          aChild=aChild.nextSibling;
        }
      }
}
