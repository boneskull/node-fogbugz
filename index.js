'use strict';

/**
 * @module fogbugz
 * @title node-fogbugz
 * @overview Provides FogBugz API functionality.
 This is still in development as the API has not fully been built out yet, but
 I hope to get everything in place eventually.
 Installation
 ============
 ```
 npm install fogbugz
 ```
 Configuration
 =============
 Create a `fogbugz.conf.json` in your app's root directory.  It should look like
 this:
 ```json
 {
   "protocol": "https",
   "host": "zzz.fogbugz.com",
   "username": "zzz@yyy.com",
   "password": "Password1"
 }
 ```
 Usage
 =====
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
 * @author Christopher Hiller <chiller@badwing.com>
 * @version 0.2.3
 * @license MIT
 */
var request = require('request');
var Q = require('q');
var format = require('util').format;
var extend = require('util')._extend;
var xml2js = require('xml2js');
var _ = require('lodash-node');
var cache = require('memory-cache');

var conf;
var fogbugz;

/**
 * URL masks for the various API calls
 * @type {{logon: string, logoff: string, listFilters: string,
 *     setCurrentFilter: string, search: string}}
 */
var URLs = {
  edit: '%s://%s/api.asp?cmd=edit&token=%s&ixBug=%s&cols=%s',
  logon: '%s://%s/api.asp?cmd=logon&email=%s&password=%s',
  logoff: '%s://%s/api.asp?cmd=logoff&token=%s',
  listFilters: '%s://%s/api.asp?cmd=listFilters&token=%s',
  setCurrentFilter: '%s://%s/api.asp?cmd=setCurrentFilter&sFilter=%s&token=%s',
  search: '%s://%s/api.asp?cmd=search&q=%s&cols=%s&max=%s&token=%s'
};

/**
 * Internal error strings.
 * @type {{undefined_token: string, xml_parse_error: string, unknown: string}}
 */
var MODULE_ERRORS = {
  undefinedToken: 'token is undefined; you are not logged in',
  xmlParseError: 'invalid xml received from server',
  bugNotFound: 'could not find bug',
  unknown: 'unknown error'
};

/**
 * Default fields to pull when querying cases
 * @type {Array}
 */
var DEFAULT_COLS = [
  'sTitle',
  'sStatus',
  'sPersonAssignedTo',
  'sFixFor',
  'tags',
  'sEmailAssignedTo'
];

/**
 * Default maximum number of cases to pull.
 * @type {number}
 */
var DEFAULT_MAX = 20;

/**
 * Parses XML and returns JSON.
 * @param {string} xml XML string
 * @param {Deferred} dfrd The promise that we're parsing values of
 * @returns {Object} JSON representation of XML
 */
function _parse(xml, dfrd) {
  var parser = new xml2js.Parser();
  var r;
  parser.parseString(xml, function(err, res) {
    if (err) {
      dfrd.reject(MODULE_ERRORS.xmlParseError);
      return;
    }
    if (res.response.error) {
      dfrd.reject(res.response.error);
      return;
    }
    r = res;
  });
  return r;
}

/**
 * Filter pseudoclass
 * @class Filter
 * @constructor
 * @param {Object} obj Object representing Filter
 */
function Filter(obj) {
  extend(this, obj);
}

/**
 * Sets the current filter to be this Filter
 * @method setCurrent
 * @returns {Promise.<boolean>} True if successful
 */
Filter.prototype.setCurrent = function() {
  return fogbugz.setCurrentFilter(this);
};

/**
 * Case pseudoclass
 * @class Case
 * @constructor
 * @param {Object} obj Object representing Case
 */
function Case(obj) {
  extend(this, obj);
}

/**
 * Basically just asserts an empty response has no errors in it.
 * @param {string} xml XML to parse
 * @param {Q.defer} dfrd Q deferred object
 */
function _extractEmptyResponse(xml, dfrd) {
  var parser = new xml2js.Parser();
  parser.parseString(xml, function(err, res) {
    if (err) {
      dfrd.reject();
      return MODULE_ERRORS.xmlParseError;
    }
    if (res.response.error) {
      dfrd.reject(res.response.error);
    }
  });
}

fogbugz = {
  MODULE_ERRORS: MODULE_ERRORS,

  /**
   * Forgets the stored token.
   * @method forgetToken
   */
  forgetToken: function forgetToken() {
    cache.del('token');
  },

  /**
   * Manually sets a login token if you have one by some other means.
   * @see fogbugz.logon
   * @method setToken
   * @param {string} token FogBugz API logon token
   */
  setToken: function setToken(token) {
    cache.put('token', token);
  },

  /**
   * Assuming you are logged in and have a cached token, this will log you out.
   * @method logoff
   * @returns {Function|promise|Q.promise} Promise
   */
  logoff: function logoff() {
    var token = cache.get('token');
    var dfrd = Q.defer();
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefinedToken);
    } else {
      request(format(URLs.logoff, conf.protocol, conf.host, token),
        function(err) {
          if (err) {
            dfrd.reject(err);
          } else {
            dfrd.resolve(true);
          }
        });
    }
    return dfrd.promise;
  },

  /**
   * Logs you into FogBugz based on contents of `fogbugz.conf.json`.
   * @method logon
   * @returns {Function|promise|Q.promise} Promise
   */
  logon: function logon() {
    var dfrd = Q.defer();
    var token = cache.get('token');

    function extractToken(xml) {
      var r = _parse(xml, dfrd);
      if (r) {
        return r.response.token[0];
      }
    }

    if (token) {
      dfrd.resolve({
        token: token,
        cached: true
      });
    }

    request(format(URLs.logon, conf.protocol, conf.host, conf.username,
        conf.password),
      function(err, res, body) {
        var newToken;
        if (err) {
          dfrd.reject(err);
        } else {
          newToken = extractToken(body);
          if (!newToken) {
            dfrd.reject(MODULE_ERRORS.unknown);
          } else {
            cache.put('token', newToken);
            dfrd.resolve({
              token: newToken,
              cached: false
            });
          }
        }
      });
    return dfrd.promise;
  },

  /**
   * Retrieves a list of Filters as an array.  Each item in the array is of
   * type Filter.  Example:
   ```
   [{"name": "My Cases", "type": "builtin", "id": "ez",
    "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=ez"}),
   {"name": "Inbox", "type": "builtin", "id": "inbox",
     "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=inbox"}]
   ```
   * @method listFilters
   * @see class fogbugz.Filter
   * @returns {Function|promise|Q.promise} Promise
   */
  listFilters: function listFilters() {
    var token = cache.get('token');
    var dfrd = Q.defer();

    function extractFilters(xml) {
      var r = _parse(xml, dfrd);
      if (r) {
        return r.response.filters[0].filter
          .map(function(filter) {
            return new Filter({
              name: filter._.trim(),
              type: filter.$.type,
              id: filter.$.sFilter,
              url: format('%s://%s/default.asp?pgx=LF&ixFilter=%s',
                conf.protocol, conf.host, filter.$.sFilter)
            });
          });
      }
    }

    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefinedToken);
    } else {
      request(format(URLs.listFilters, conf.protocol, conf.host, token),
        function(err, res, body) {
          var filters;
          if (err) {
            dfrd.reject(err);
          } else {
            filters = extractFilters(body);
            if (filters && filters.length) {
              dfrd.resolve(extractFilters(body));
            } else {
              dfrd.reject(MODULE_ERRORS.unknown);
            }
          }
        });
    }
    return dfrd.promise;
  },

  /**
   * Sets the current Filter. I'm not sure what this does exactly.
   * @method setCurrentFilter
   * @param {Filter|string} filter Filter object or string ID
   * @see class fogbugz.Filter
   * @returns {Promise.<boolean>} True if success
   */
  setCurrentFilter: function setCurrentFilter(filter) {
    var token = cache.get('token');
    var dfrd = Q.defer();
    var id;
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefinedToken);
    } else {
      id = typeof filter === 'string' ? filter : filter.id;
      request(format(URLs.setCurrentFilter, conf.protocol, conf.host, id,
        token), function(err, res, body) {
        if (err) {
          dfrd.reject(err);
        } else {
          _extractEmptyResponse(body, dfrd);
          dfrd.resolve(true);
        }
      });
    }
    return dfrd.promise;
  },

  /**
   * Performs a search against FogBugz's cases
   * @method search
   * @param {string} query Query stirng
   * @param {array} [cols] Fields to pull
   * @param {number} [max] Number of cases to get at once
   * @returns {Promise.<(Array.<Case>|Case)>} Case or cases
   */
  search: function search(query, cols, max) {
    var token = cache.get('token');
    var cases;
    var fields;
    var dfrd = Q.defer();
    var requestOptions;

    function extractCases(xml) {
      var r = _parse(xml, dfrd);
      if (!r ||
        !r.response ||
        !r.response.cases ||
        !r.response.cases.length ||
        !r.response.cases[0].case) {
        return dfrd.reject(MODULE_ERRORS.bugNotFound);
      }
      cases = r.response.cases[0].case.map(function(kase) {
        var bug = new Case({
          id: kase.$.ixBug,
          operations: kase.$.operations.split(','),
          title: kase.sTitle[0].trim(),
          status: kase.sStatus[0].trim(),
          url: format('%s://%s/default.asp?%s', conf.protocol, conf.host,
            kase.$.ixBug),
          fixFor: kase.sFixFor[0].trim()
        });
        if (kase.sPersonAssignedTo) {
          bug.assignedTo = kase.sPersonAssignedTo[0].trim();
          bug.assignedToEmail = kase.sEmailAssignedTo[0].trim();
        }
        if (kase.tags && kase.tags[0].tag) {
          bug.tags = kase.tags[0].tag.join(', ');
        }
        // find anything leftover in the case, disregarding the fields we
        // already
        _(kase)
          .keys()
          .difference(_.keys(bug).concat('sTitle', 'sStatus', '$',
            'sFixFor', 'sPersonAssignedTo',
            'sEmailAssignedTo'))
          .each(function(key) {
            var value = kase[key];
            bug[key] = _.isArray(value) && value.length === 1 ?
              // dereference
              bug[key] = value[0].trim() :
              value;
          });
        bug._raw = kase;
        return bug;
      });
      if (cases.length > 1) {
        return cases;
      }
      return cases[0];
    }

    fields = (cols || DEFAULT_COLS).join(',');
    max = max || DEFAULT_MAX;
    query = encodeURIComponent(query);
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefinedToken);
    } else {
      requestOptions = {
        url: conf.protocol + '://' + conf.host + '/api.asp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/form-data'
        },
        form: {
          cmd: 'search',
          token: token,
          q: decodeURIComponent(query),
          max: max,
          cols: fields
        }
      };
      request(requestOptions, function(err, res, body) {
        var newCases;
        if (err) {
          dfrd.reject(err);
        } else {
          newCases = extractCases(body);
          if (!newCases) {
            console.error(body);
            dfrd.reject(MODULE_ERRORS.unknown);
          } else {
            dfrd.resolve(newCases);
          }
        }
      });
    }
    return dfrd.promise;
  },

  /**
   * Edit a bug by ID
   * @method editBug
   * @param {number} [id] -- the ixBug of a case that you want edit
   * @param {Object} [parameters] -- the parameters you want edit
   * @param {array} [cols] The columns you want returned about this case
   * @todo change return value; DRY
   * @returns {Promise.<Array.<Case>>} Cases, though singular
   */
  editBug: function editBug(id, parameters, cols) {
    var token = cache.get('token');
    var cases;
    var fields;
    var url;
    var dfrd = Q.defer();

    function extractCases(xml) {
      var r = _parse(xml, dfrd);
      if (!r || !r.response || !r.response.case || !r.response.case.length) {
        return dfrd.reject(new Error(MODULE_ERRORS.xmlParseError));
      }
      cases = r.response.case.map(function(kase) {
        var bug = new Case({
          id: kase.$.ixBug,
          operations: kase.$.operations.split(','),
          title: kase.sTitle[0].trim(),
          status: kase.sStatus[0].trim(),
          url: format('%s://%s/default.asp?%s', conf.protocol, conf.host,
            kase.$.ixBug),
          fixFor: kase.sFixFor[0].trim()
        });
        if (kase.sPersonAssignedTo) {
          bug.assignedTo = kase.sPersonAssignedTo[0].trim();
          bug.assignedToEmail = kase.sEmailAssignedTo[0].trim();
        }
        if (kase.tags && kase.tags[0].tag) {
          bug.tags = kase.tags[0].tag.join(', ');
        }
        // find anything leftover in the case, disregarding the fields we
        // already
        _(kase)
          .keys()
          .difference(_.keys(bug).concat('sTitle', 'sStatus', '$',
            'sFixFor', 'sPersonAssignedTo',
            'sEmailAssignedTo'))
          .each(function(key) {
            var value = kase[key];
            bug[key] = _.isArray(value) && value.length === 1 ?
              // dereference
              bug[key] = value[0].trim() :
              value;
          });
        bug._raw = kase;
        return bug;
      });
      if (cases.length > 1) {
        return cases;
      }
      return cases[0];
    }

    fields = cols.concat(DEFAULT_COLS).join(',');
    id = encodeURIComponent(id);

    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefinedToken);
    } else {
      url = format(URLs.edit, conf.protocol, conf.host, token, id, fields);
      // Some work need to do, parameters .....
      Object.keys(parameters).forEach(function(k) {
        url += '&' + k + '=' + parameters[k];
      });
      request(url, function(err, res, body) {
        var newCases;
        if (err) {
          dfrd.reject(err);
        } else {
          newCases = extractCases(body);
          if (!newCases) {
            console.error(body);
            dfrd.reject(MODULE_ERRORS.unknown);
          } else {
            dfrd.resolve(newCases);
          }
        }
      });
    }
    return dfrd.promise;
  },

  /**
   * Gets a bug by ID
   * @param {string|number} id ID of bug
   * @param {number} [cols] Cols to pull
   * @returns {Promise.<(Array.<Case>|Case)>} Case or cases
   */
  getBug: function getBug(id, cols) {
    return this.search(id, cols, 1);
  }
};

if (process.env.NODE_FOGBUGZ_CONFIG) {
  conf = require(process.env.NODE_FOGBUGZ_CONFIG);
} else {
  conf = require('./fogbugz.conf.json');
}

//Default to https if protocol not specified in conf (backwards compatibility)
conf.protocol = conf.protocol || 'https';

module.exports = fogbugz;
module.exports.Filter = Filter;
module.exports.Case = Case;
