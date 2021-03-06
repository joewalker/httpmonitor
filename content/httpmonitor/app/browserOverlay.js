/* See license.txt for terms of usage */

/**
 * This file represents a dynamic browser overlay. It's executed in every browser.xul
 * scope to append basic UI for opening the HTTP Monitor console window.
 * There is a new menu: Web Developer -> HTTP Monitor
 */
(function() {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;

// Elements dynamically inserted into the browser window (browser.xul scope) must be
// remembered so, they can be removed when the extension is uninstalled.
// Note that this happens for every browser window independently.
var nodesToRemove = [];

// ********************************************************************************************* //
// Helper Functions

function $(id)
{
    return document.getElementById(id);
}

function $menupopupOverlay(parent, children)
{
    if (!parent)
        return;

    for each(var child in children)
    {
        var id = child.getAttribute("insertbefore"), beforeEl;
        if (id)
            beforeEl = parent.querySelector("#" + id);

        if (!beforeEl)
        {
            id = child.getAttribute("insertafter");

            if (id)
                beforeEl = parent.querySelector("#" + id);
            if (beforeEl)
                beforeEl = beforeEl.nextSibling;
        }

        parent.insertBefore(child, beforeEl);

        nodesToRemove.push(child);
    }
}

function $menuitem(attrs)
{
    return $el("menuitem", attrs);
}

function $menuseparator(attrs)
{
    return $el("menuseparator", attrs);
}

function $el(name, attributes, children, parent)
{
    attributes = attributes || {};

    if (!Array.isArray(children))
    {
        parent = children;
        children = null;
    }

    // localize
    //if (attributes.label)
    //    attributes.label = Locale.$STR(attributes.label);

    //if (attributes.tooltiptext)
    //    attributes.tooltiptext = Locale.$STR(attributes.tooltiptext);

    // persist
    if (attributes.persist)
        updatePersistedValues(attributes);

    var el = document.createElement(name);
    for (var a in attributes)
        el.setAttribute(a, attributes[a]);

    for each(var a in children)
        el.appendChild(a);

    if (parent)
    {
        if (attributes.position)
            parent.insertBefore(el, parent.children[attributes.position - 1]);
        else
            parent.appendChild(el);

        nodesToRemove.push(el);
    }

    return el;
}

function $command(id, oncommand, arg)
{
    return $el("command", {
        id: id,
        oncommand: oncommand
    }, $("mainCommandSet"))
}

function $key(id, keycode, modifiers, command, position)
{
    return $el("key", {
        id: id,
        keycode: keycode,
        modifiers: modifiers,
        command: command,
        position: position
    }, $("mainKeyset"))
}

function $toolbarButton(id, attrs, children, defaultPos)
{
    attrs["class"] = "toolbarbutton-1 chromeclass-toolbar-additional";
    attrs.httpMonitorRootNode = true;
    attrs.id = id;

    // in seamonkey gNavToolbox is null onload
    var button = $el("toolbarbutton", attrs, children, (gNavToolbox || $("navigator-toolbox")).palette);

    var selector = "[currentset^='" + id + ",'],[currentset*='," + id + ",'],[currentset$='," + id + "']";
    var toolbar = document.querySelector(selector);
    if (!toolbar)
        return; // todo defaultPos

    var currentset = toolbar.getAttribute("currentset").split(",");
    var i = currentset.indexOf(id) + 1;

    var len = currentset.length, beforeEl;
    while (i < len && !(beforeEl = $(currentset[i])))
        i++;

    return toolbar.insertItem(id, beforeEl);
}

function $stylesheet(href)
{
    var s = document.createProcessingInstruction("xml-stylesheet", 'href="' + href + '"');
    document.insertBefore(s, document.documentElement);
    nodesToRemove.push(s);
}

// ********************************************************************************************* //
// Overlay Browser UI

// Firefox Tools -> Web Developer Menu
$menupopupOverlay($("menuWebDeveloperPopup"), [
    $menuitem({
        id: "menu_httpMonitor",
        command: "cmd_httpMonitorToggle",
        insertafter: "webConsole",
        label: "HTTP Monitor",
        "class": "menu-iconic"
    })
]);

// Firefox 4 Web Developer Menu
$menupopupOverlay($("appmenu_webDeveloper_popup"), [
    $menuitem({
        id: "appmenu_httpMonitor",
        insertafter: "appmenu_webConsole",
        command: "cmd_httpMonitorToggle",
        label: "HTTP Monitor",
        iconic: "true",
        "class": "fbInternational"
    })
]);

// Sea Monkey Tools Menu
$menupopupOverlay($("toolsPopup"), [
    $menuitem({
        id: "menu_httpMonitor",
        insertafter: "appmenu_webConsole",
        command: "cmd_httpMonitoToggle",
        label: "HTTP Monitor",
        "class": "menuitem-iconic"
    })
]);

// ********************************************************************************************* //
// Commands

$command("cmd_httpMonitorToggle", "HttpMonitorOverlay.toggle()");

// ********************************************************************************************* //
// Extension Object

/**
 * This is the only global in browser.xul scope. It's global only to be reachable from
 * the <command> element. It should be changed so, the global isn't needed.
 */ 
top.HttpMonitorOverlay =
{
    toggle: function()
    {
        this.open();
    },

    open: function()
    {
        var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
        var win = wm.getMostRecentWindow("HTTPMonitor");
        if (win)
        {
            win.focus();
        }
        else
        {
            var args = {};
            win = openDialog(
                "chrome://httpmonitor/content/app/monitor.xul",
                "HTTPMonitor",
                "chrome,resizable,scrollbars=auto,minimizable,dialog=no",
                args);
        }

        return win;
    },

    close: function()
    {
        // xxxHonza: TODO
    },

    shutdown: function()
    {
        for (var i=0; i<nodesToRemove.length; i++)
        {
            var el = nodesToRemove[i];
            if (el && el.parentNode)
                el.parentNode.removeChild(el);
        }
    }
}

// ********************************************************************************************* //
})();
