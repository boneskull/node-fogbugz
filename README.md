node-fogbugz
============
**Author:** Christopher Hiller

**Overview:** Provides FogBugz API functionality.
This is still in development as the API has not fully been built out yet, but
I hope to get everything in place eventually.

module fogbugz
==============
fogbugz.forgetToken()
---------------------
Forgets the stored token.

fogbugz.setToken(token)
-----------------------
Manually sets a login token if you have one by some other means.

**Parameters**

**token**:  *string*,  FogBugz API logon token

*See Also*

[fogbugz.logon](#fogbugzlogon)

fogbugz.logoff()
----------------
Assuming you are logged in and have a cached token, this will log you out.

**Returns**

*Function|promise|Q.promise*,  Promise

fogbugz.logon()
---------------
Logs you into FogBugz based on contents of `fogbugz.conf.json`.

**Returns**

*Function|promise|Q.promise*,  Promise

fogbugz.listFilters()
---------------------
Retrieves a list of Filters as an array.  Each item in the array is of type Filter.  Example:
```
 [{"name": "My Cases", "type": "builtin", "id": "ez",
    "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=ez"}),
  {"name": "Inbox", "type": "builtin", "id": "inbox",
    "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=inbox"}]
```

**Returns**

*Function|promise|Q.promise*,  Promise

*See Also*

[class fogbugz.Filter](#class-fogbugzfilter)

fogbugz.setCurrentFilter(filter)
--------------------------------
Sets the current Filter. I'm not sure what this does exactly.

**Parameters**

**filter**:  *Filter|string*,  Filter object or string ID

*See Also*

[class fogbugz.Filter](#class-fogbugzfilter)

fogbugz.search(query, \[cols\], \[max\])
----------------------------------------
Performs a search against FogBugz's cases

**Parameters**

**query**:  *string*,  Query stirng

**[cols]**:  *array*,  Fields to pull

**[max]**:  *number*,  Number of cases to get at once

**Returns**

*Function|promise|Q.promise*,  Promise

class fogbugz.Filter
--------------------
Filter pseudoclass

**Parameters**

**obj**:  *Object*,  Object representing Filter

**Methods**

fogbugz.Filter.setCurrent()
---------------------------
Sets the current filter to be this Filter

class fogbugz.Case
------------------
Case pseudoclass

**Parameters**

**obj**:  *Object*,  Object representing Case

