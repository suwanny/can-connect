// load connections

require("can-connect/constructor/");
require("can-connect/can/map/");
require("can-connect/constructor/store/");
require("can-connect/data/callbacks/");
require("can-connect/data/callbacks-cache/");
require("can-connect/data/combine-requests/");
require("can-connect/data/localstorage-cache/");
require("can-connect/data/parse/");
require("can-connect/data/url/");
require("can-connect/fall-through-cache/");
require("can-connect/real-time/");
require("can-connect/data/inline-cache/");
require("when/es6-shim/Promise");

var Map = require("can/map/map");
var List = require("can/list/list");

var connect=  require("can-connect/can-connect");

var QUnit = require("steal-qunit");

var can = require("can/util/util");
var fixture = require("can/util/fixture/fixture");
var testHelpers = require("can-connect/test-helpers");

var later = testHelpers.later;

var logErrorAndStart = function(e){
	debugger;
	ok(false,"Error "+e);
	start();
};

QUnit.module("can-connect/can/map",{
	setup: function(){
		
		var Todo = Map.extend({
			
		});
		var TodoList = List.extend({
			Map: Todo
		});
		this.Todo = Todo;
		this.TodoList = TodoList;
		
		var cacheConnection = connect(["data-localstorage-cache"],{
			name: "todos"
		});
		cacheConnection.clear();
		this.cacheConnection = cacheConnection;
		
		this.Todo = Todo;
		
		this.todoConnection = connect([
			"constructor",
			"can-map",
			"constructor-store",
			"data-callbacks",
			"data-callbacks-cache",
			"data-combine-requests",
			"data-inline-cache",
			"data-parse",
			"data-url",
			"fall-through-cache",
			"real-time"],
			{
				url: "/services/todos",
				cacheConnection: cacheConnection,
				Map: Map,
				List: TodoList,
				ajax: $.ajax
			});
		
		
	}
});


QUnit.test("real-time super model", function(){
	
	var firstItems = [ {id: 0, type: "important"}, {id: 1, type: "important"} ];
	var secondItems = [ {id: 2, due: "today"}, {id: 3, due: "today"} ];
	
	var state = testHelpers.makeStateChecker(QUnit, [
		"getListData-important",
		"getListData-today",
		"createData-today+important",
		"updateData-important",
		"updateData-today",
		"destroyData-important-1",
		"getListData-today-2"
	]);
	
	stop();
	
	fixture({
		"GET /services/todos": function(){
			if(state.get() === "getListData-important") {
				state.next();
				return {data: firstItems.slice(0) };
			} else if(state.get() === "getListData-today"){
				state.next();
				return {data: secondItems.slice(0) };
			} else {
				state.check("getListData-today-2");
				return { data: secondItems.slice(1) };
			}
		},
		"POST /services/todos": function(request){
			if( state.get() === "createData-today+important" ) {
				state.next();
				// todo change to all props
				return can.simpleExtend({id: 10}, request.data);
			} 
		},
		"PUT /services/todos/{id}": function(request){
			if( state.get() === "updateData-important" || state.get() === "updateData-today" ) {
				state.next();
				// todo change to all props
				return can.simpleExtend({},request.data);
			} else {
				ok(false, "bad state!");
				debugger;
				start();
			}
		},
		"DELETE /services/todos/{id}": function(request){
			if(state.get() === "destroyData-important-1") {
				state.next();
				// todo change to all props
				return can.simpleExtend({destroyed:  1},request.data);
			}
		}
	});
	
	function checkCache(name, set, expectData, next) {
		cacheConnection.getListData(set).then(function(data){
			deepEqual(data.data.map(testHelpers.getId), expectData.map(testHelpers.getId), name);
			setTimeout(next, 1);
		});
	}
	
	var connection = this.todoConnection,
		cacheConnection = this.cacheConnection,
		Todo = this.Todo,
		TodoList = this.TodoList;
	
	var importantList,
		todayList,
		bindFunc = function(){
			console.log("length changing");
		};
	Promise.all([connection.getList({type: "important"}), connection.getList({due: "today"})])
		.then(function(result){
		
		importantList = result[0];
		todayList = result[1];
		
		importantList.bind("length", bindFunc);
		todayList.bind("length",bindFunc);
		
		setTimeout(createImportantToday,1);
		
	}, logErrorAndStart);
	
	var created;
	function createImportantToday() {
		connection.save(new Todo({
			type: "important",
			due: "today",
			createId: 1
		})).then( function(task){
			created = task;
			setTimeout(checkLists, 1);
		}, logErrorAndStart);
	}
	
	
	function checkLists() {
		ok( importantList.indexOf(created) >= 0, "in important");
		ok( todayList.indexOf(created) >= 0, "in today");
		
		checkCache("cache looks right", {type: "important"}, firstItems.concat(created.serialize()),serverSideDuplicateCreate );
	}
	

	
	function serverSideDuplicateCreate(){
		connection.createInstance({id: 10, due: "today",createdId: 1, type: "important"}).then(function(createdInstance){
			equal(createdInstance, created);
			
			ok( importantList.indexOf(created) >= 0, "in important");
			ok( todayList.indexOf(created) >= 0, "in today");
			
			equal(importantList.length, 3, "items stays the same");
			
			checkCache("cache looks right", {type: "important"}, firstItems.concat(created.serialize()),serverSideCreate );
		});
		
	}
	
	var serverCreatedInstance;
	function serverSideCreate(){
		connection.createInstance({id: 11, due: "today", createdId: 2, type: "important"}).then(function(createdInstance){
			serverCreatedInstance = createdInstance;
		
			ok( importantList.indexOf(createdInstance) >= 0, "in important");
			ok( todayList.indexOf(createdInstance) >= 0, "in today");
			
			checkCache( "cache looks right afer SS create", {type: "important"}, firstItems.concat(created.serialize(), serverCreatedInstance.serialize()), update1 );
		});
	}
	
	function update1() {
		created.removeAttr("due");
		connection.save(created).then(later(checkLists2), logErrorAndStart);
	}
	function checkLists2() {
		ok( importantList.indexOf(created) >= 0, "still in important");
		equal( todayList.indexOf(created) , -1, "removed from today");
		update2();
	};
	
	function update2() {
		created.removeAttr("type");
		created.attr("due","today");
		connection.save(created).then(later(checkLists3), logErrorAndStart);
	}
	function checkLists3() {
		equal( importantList.indexOf(created),  -1, "removed from important");
		ok( todayList.indexOf(created) >= 1, "added to today");
		
		checkCache("cache looks right after update2", {type: "important"}, firstItems.concat(serverCreatedInstance.serialize()),serverSideUpdate );
		
		serverSideUpdate();
	}
	
	function serverSideUpdate(){

		connection.updateInstance({
			type: "important",
			due: "today",
			createId: 1,
			id: 10
		}).then(function(instance){
			equal(created, instance);
			ok( importantList.indexOf(created) >= 0, "in important");
			ok( todayList.indexOf(created) >= 0, "in today");
			
			
			checkCache( "cache looks right afer SS update", {type: "important"}, importantList.serialize(), destroyItem );
		});
		
	}
	
	
	var firstImportant;
	function destroyItem(){
		firstImportant = importantList[0];
		
		connection.destroy(firstImportant)
			.then(later(checkLists4),logErrorAndStart);
	}
	
	function checkLists4(){
		equal( importantList.indexOf(firstImportant), -1, "in important");
		checkCache( "cache looks right afer destroy", {type: "important"}, importantList.serialize(), serverSideDestroy );
	}
	
	function serverSideDestroy(){
		connection.destroyInstance({
			type: "important",
			due: "today",
			createId: 1,
			id: 10
		}).then(function(instance){
			equal(instance, created, "got back deleted instance");
			equal( importantList.indexOf(created), -1, "still in important");
			equal( todayList.indexOf(created) , -1, "removed from today");
			
			checkCache( "cache looks right afer ss destroy", {type: "important"}, importantList.serialize(), function(){
				checkCache( "cache looks right afer SS destroy", {due: "today"}, todayList.serialize(), getListDueTodayAgainstCache);
			} );
		});
		
	}
	
	function getListDueTodayAgainstCache(){
		connection.getList({due: "today"}).then(function(updatedTodayList){
			var added = serverCreatedInstance.serialize();
			equal(todayList, updatedTodayList, "same todo list returned");
			
			deepEqual( updatedTodayList.serialize(), secondItems.concat([added]), "got initial items from cache");
			
			var batchNum;
			todayList.bind("length", function(ev){
				if(!ev.batchNum || ev.batchNum !== batchNum) {
					deepEqual( updatedTodayList.serialize(), secondItems.slice(1), "updated cache");
					start();
					batchNum = ev.batchNum;
				}
				
			});
		});
	}
	
});


