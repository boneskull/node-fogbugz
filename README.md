# node-fogbugz [![npm version](https://badge.fury.io/js/fogbugz.svg)](http://badge.fury.io/js/fogbugz) [![Build Status](https://travis-ci.org/boneskull/node-fogbugz.png?branch=master)](https://travis-ci.org/boneskull/node-fogbugz) [![Codacy Badge](https://www.codacy.com/project/badge/116d709e21c84d5cb16cefc3096528d7)](https://www.codacy.com/app/boneskull/node-fogbugz)

> Talks to FogBugz' icky XML API for you. 

## Installation

```shell
$npm install fogbugz
```

## Configuration

Create a `fogbugz.conf.json` in your app's root directory.  It should look like this:

```json
{
  "protocol": "https",
  "host": "zzz.fogbugz.com",
  "username": "zzz@yyy.com",
  "password": "Password1"
}
```

## Usage

```javascript
var fogbugz = require('fogbugz');
fogbugz.logon()
 .then(function() {
   return fogbugz.getBug('12345');
 })
 .then(function(bug) {
    console.log(bug.title);
 });
```

## API

## fogbugz

```js
var fogbugz = require('fogbugz');
```

#### fogbugz.forgetToken()

Forgets the stored token.

#### fogbugz.setToken(token)

Manually sets a login token if you have one by some other means.

> ##### Parameters

> `token`:  *string*,  FogBugz API logon token

#### fogbugz.logoff()

Assuming you are logged in and have a cached token, this will log you out.

> ##### Returns

> *Function|promise|Q.promise*,  Promise

#### fogbugz.logon()

Logs you into FogBugz based on contents of `fogbugz.conf.json`.

> ##### Returns

> *Function|promise|Q.promise*,  Promise

#### fogbugz.listFilters()

Retrieves a list of Filters as an array.  Each item in the array is of type Filter.  Example:
  
```json
[{"name": "My Cases", "type": "builtin", "id": "ez",
"url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=ez"}),
{"name": "Inbox", "type": "builtin", "id": "inbox",
 "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=inbox"}]
```

> ##### Returns

> *Function|promise|Q.promise*,  Promise

#### fogbugz.setCurrentFilter(filter)

Sets the current Filter. Allows to call fogbugz.search() with an empty string
 as the 'query' paramenter to list all cases in the current filter.

> ##### Parameters

> `filter`:  *Filter|string*,  Filter object or string ID

#### fogbugz.search(query, \[cols\], \[max\])

Performs a search against FogBugz's cases.  Promise resolves to a `Case` object or an array of `Case` objects.

> ##### Parameters

> `query`:  *string*,  Query string

> `[cols]`:  *array*,  Fields to pull

> `[max]`:  *number*,  Number of cases to get at once

> ##### Returns

> *Function|promise|Q.promise*,  Promise

#### fogbugz.getBug(id, \[cols\])

Gets a bug by ID

> ##### Parameters

> `id`:  *string|number*,  ID of bug

> `[cols]`:  *number*,  Cols to pull; defaults to everything

### class fogbugz.Filter()

Filter pseudoclass

> ##### Parameters

> `obj`:  *Object*,  Object representing Filter

#### fogbugz.Filter.setCurrent()

Sets the current filter to be this Filter

### class fogbugz.Case()

Case pseudoclass.  Stores original case data from server in its `_raw` property.

> ##### Parameters

> `obj`:  *Object*,  Object representing Case

## Author

[Christopher Hiller](http://boneskull.com)

## License

MIT
