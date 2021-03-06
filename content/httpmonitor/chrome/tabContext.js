/* See license.txt for terms of usage */

define([
    "httpmonitor/lib/trace",
    "httpmonitor/lib/window",
    "httpmonitor/lib/url",
    "httpmonitor/cache/tabCache",
    "httpmonitor/lib/object",
    "httpmonitor/lib/array",
    "httpmonitor/chrome/chrome",
],
function(FBTrace, Win, Url, TabCache, Obj, Arr, Chrome) {

// ********************************************************************************************* //
// Constants

var Cc = Components.classes;
var Ci = Components.interfaces;

var Timer = Cc["@mozilla.org/timer;1"];

// ********************************************************************************************* //
// Implementation

function TabContext(tab, persistedState)
{
    this.uid = Obj.getUniqueId();

    this.tab = tab;
    this.window = tab.linkedBrowser ? tab.linkedBrowser.contentWindow : null;
    this.browser = tab.linkedBrowser ? tab.linkedBrowser : null;

    //xxxHonza: hack, this comes from the actor tab.
    if (!this.window)
        this.window = tab._browser ? tab._browser._contentWindow : null;

    if (!this.browser)
        this.browser = tab._browser ? tab._browser : null;

    // xxxHonza: should be passed into create method.
    this.persistedState = persistedState || {};

    this.windows = [];
    this.name = Url.normalizeURL(this.getWindowLocation().toString());
    this.sourceCache = new TabCache(this);
}

TabContext.prototype = 
{
    getCurrentTabId: function()
    {
        // xxxHonza: tab.id should be always used.
        return this.tab.linkedBrowser ? this.tab.linkedBrowser : tab.id;
    },

    getWindowLocation: function()
    {
        return this.getTitle();
    },

    getTitle: function()
    {
        if (this.window && this.window.document)
            return this.window.document.title;
        else
            return this.tab.label;
    },

    getName: function()
    {
        return this.getTitle();
    },

    create: function(doc)
    {
        this.netPanel = this.createNetPanel(doc);
    },

    destroy: function(state)
    {
        // All existing timeouts need to be cleared
        if (this.timeouts)
        {
            for (var timeout in this.timeouts)
                timeout.cancel();
        }

        // Also all waiting intervals must be cleared.
        if (this.intervals)
        {
            for (var timeout in this.intervals)
                clearInterval(timeout);
        }

        // All existing DOM listeners need to be cleared
        this.unregisterAllListeners();

        state.panelState = {};

        // Inherit panelStates that have not been restored yet
        if (this.persistedState)
        {
            for (var panelName in this.persistedState.panelState)
                state.panelState[panelName] = this.persistedState.panelState[panelName];
        }

        // Destroy all panels in this context.
        this.destroyNetPanel(state)

        if (FBTrace.DBG_CONTEXT)
            FBTrace.sysout("tabContext.destroy " + this.getName() + " set state ", state);
    },

    getPanel: function(panelName, noCreate)
    {
        if (panelName != "net")
            return null;

        if (noCreate)
            return this.netPanel;

        if (this.netPanel)
            return this.netPanel;

        return null;
    },

    createNetPanel: function(doc)
    {
        var panelType = Chrome.getPanelType("net");
        if (!panelType)
            return null;

        var panel = new panelType();
        panel.initialize(this, doc);
        panel.show(this.persistedState);
        return panel;
    },

    destroyNetPanel: function(state)
    {
        var panelName = "net";
        var panel = this.netPanel;
        if (!panel)
            return;

        // Create an object to persist state, re-using old one if it was never restored
        var panelState = panelName in state.panelState ? state.panelState[panelName] : {};
        state.panelState[panelName] = panelState;

        try
        {
            // Destroy the panel and allow it to persist extra info to the state object
            panel.hide(this.persistedState);
            panel.destroy(panelState);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("tabContext.destroy FAILS "+exc, exc);

            // the destroy failed, don't keep the bad state
            delete state.panelState[panelName];
        }

        // Remove the panel node from the DOM and so delete its content.
        var panelNode = panel.panelNode;
        if (panelNode && panelNode.parentNode)
            panelNode.parentNode.removeChild(panelNode);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Timeouts and Intervals

    setTimeout: function(fn, delay)
    {
        return this.setTimer(fn, delay, Ci.nsITimer.TYPE_ONE_SHOT);
    },

    clearTimeout: function(timeout)
    {
        this.cancelTimer(timeout);
    },

    setInterval: function(fn, delay)
    {
        return this.setTimer(fn, delay, Ci.nsITimer.TYPE_REPEATING_SLACK);
    },

    clearInterval: function(timer)
    {
        this.cancelTimer(timer);
    },

    setTimer: function(fn, delay, type)
    {
        var callback = {
            notify: function(timer) {
                fn();
            }
        };

        var timer = Timer.createInstance(Ci.nsITimer);
        timer.initWithCallback(callback, delay, type);

        if (!this.timers)
            this.timers = [];

        this.timers.push(timer);
        return timer;
    },

    cancelTimer: function(timer)
    {
        timer.cancel();

        if (this.timers)
            Arr.remove(this.timers, timer);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Event Listeners

    addEventListener: function(parent, eventId, listener, capturing)
    {
        if (!this.listeners)
            this.listeners = [];

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.parent == parent && l.eventId == eventId && l.listener == listener &&
                l.capturing == capturing)
            {
                // Listener already registered!
                return;
            }
        }

        parent.addEventListener(eventId, listener, capturing);

        this.listeners.push({
            parent: parent,
            eventId: eventId,
            listener: listener,
            capturing: capturing,
        });
    },

    removeEventListener: function(parent, eventId, listener, capturing)
    {
        parent.removeEventListener(eventId, listener, capturing);

        if (!this.listeners)
            this.listeners = [];

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            if (l.parent == parent && l.eventId == eventId && l.listener == listener &&
                l.capturing == capturing)
            {
                this.listeners.splice(i, 1);
                return;
            }
        }

        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("tabContext.removeEventListener; Unknown listener " + eventId);
    },

    /**
     * Executed by the framework when the context is about to be destroyed.
     */
    unregisterAllListeners: function()
    {
        if (!this.listeners)
            return;

        for (var i=0; i<this.listeners.length; i++)
        {
            var l = this.listeners[i];
            l.parent.removeEventListener(l.eventId, l.listener, l.capturing);
        }

        this.listeners = null;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Proxy

    getProxy: function()
    {
        return this.proxy;
    }
}

// ********************************************************************************************* //
// Registration

return TabContext;

// ********************************************************************************************* //
});
