'use strict';

/**
 * @module fogbugz
 * @title node-fogbugz
 * @overview Provides FogBugz API functionality.
 This is still in development as the API has not fully been built out yet, but
 I hope to get everything in place eventually.
 * @author Christopher Hiller
 * @version 0.1.0
 * @license MIT
 */
var request = require('request'),
    Q = require('q'),
    fs = require('fs'),
    conf = require(process.env.PWD + '/fogbugz.conf.json'),
    format = require('util').format,
    extend = require('util')._extend,
    xml2js = require('xml2js'),
    cache = require('memory-cache');

/**
 * Default protocol
 * @type {string}
 */
var PROTOCOL = 'https';

/**
 * URL masks for the various API calls
 * @type {{logon: string, logoff: string, listFilters: string, setCurrentFilter: string, search: string}}
 */
var URLs = {
  logon: '%s://%s/api.asp?cmd=logon&email=%s&password=%s',
  logoff: '%s://%s/api.asp?cmd=logoff&token=%s',
  listFilters: '%s://%s/api.asp?cmd=listFilters&token=%s',
  setCurrentFilter: '%s://%s/api.asp?cmd=setCurrenFilter&sFilter=%s&token=%s',
  search: '%s://%s/api.asp?cmd=search&q=%s&cols=%s&max=%s&token=%s'
};

/**
 * Internal error strings.
 * @type {{undefined_token: string, xml_parse_error: string, unknown: string}}
 */
var MODULE_ERRORS = {
  undefined_token: 'token is undefined; you are not logged in',
  xml_parse_error: 'invalid xml received from server',
  unknown: 'unknown error'
};

var COLS = [
  'ixBug',
  'isBugParent',
  'ixBugChildren',
  'tags',
  'fOpen',
  'sTitle',
  'sOriginalTitle',
  'sLatestTextSummary',
  'ixBugEventlatestText',
  'ixProject',
  'sProject',
  'ixArea',
  'sArea',
  'ixGroup',
  'ixPersonAssignedTo',
  'sPersonAssignedTo',
  'sEmailAssignedTo',
  'ixPersonOpenedBy',
  'ixPersonResolvedBy',
  'iPersonClosedBy',
  'ixPersonLastEditedBy',
  'ixStatus',
  'sStatus',
  'ixPriority',
  'sPriority',
  'ixFixFor',
  'sFixFor',
  'dFixFor',
  'sVersion',
  'sComputer',
  'hrsOrigEst',
  'hrsCurrentEst',
  'hrsElapsed',
  'ixMailbox',
  'ixCategory',
  'sCategory',
  'dtOpened',
  'dtResolved',
  'dtClosed',
  'ixBugEventLatest',
  'dtLastUpdated',
  'fReplied',
  'fForwarded',
  'sTicket',
  'ixDiscussTopic',
  'dtDue',
  'sReleaseNotes',
  'ixBugEventLastView',
  'dtLastView',
  'ixRelatedBugs',
  'sScoutDescription',
  'sScoutMessage',
  'fScoutStopReportin',
  'fSubscribed'
];

/**
 * Default fields to pull when querying cases
 * @type {Array}
 */
var DEFAULT_COLS = [
  'sTitle',
  'sStatus'
];

/**
 * Default maximum number of cases to pull.
 * @type {number}
 */
var DEFAULT_MAX = 20;

/**
 * Basically just asserts an empty response has no errors in it.
 * @param {string} xml XML to parse
 * @param {Q.defer} dfrd Q deferred object
 */
var _extractEmptyResponse = function _extractEmptyResponse(xml, dfrd) {
  var parser = new xml2js.Parser();
  parser.parseString(xml, function (err, res) {
    if (err) {
      dfrd.reject();
      return MODULE_ERRORS.xml_parse_error;
    }
    if (res.response.error) {
      dfrd.reject(res.response.error);
    }
  });
};

var fogbugz = {
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
    var token = cache.get('token'),
        dfrd = Q.defer();
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.logoff, PROTOCOL, conf.host, token),
          function (err) {
            if (err) {
              dfrd.reject(err);
            }
            else {
              dfrd.resolve(true);
            }
          })
    }
    return dfrd.promise;
  },

  /**
   * Logs you into FogBugz based on contents of `fogbugz.conf.json`.
   * @method logon
   * @returns {Function|promise|Q.promise} Promise
   */
  logon: function logon() {
    var dfrd = Q.defer(),
        extractToken = function extractToken(xml) {
          var parser = new xml2js.Parser(), r;
          parser.parseString(xml, function (err, res) {
            if (err) {
              dfrd.reject(MODULE_ERRORS.xml_parse_error);
              return;
            }
            if (res.response.error) {
              dfrd.reject(res.response.error);
              return;
            }
            r = res;
          });
          if (r) {
            return r.response.token[0];
          }
        }, token = cache.get('token');

    if (token) {
      dfrd.resolve({
        token: token,
        cached: true
      });
    }

    request(format(URLs.logon, PROTOCOL, conf.host, conf.username,
        conf.password),
        function (err, res, body) {
          var token;
          if (err) {
            dfrd.reject(err);
          }
          else {
            token = extractToken(body);
            if (!token) {
              dfrd.reject(MODULE_ERRORS.unknown);
            }
            else {
              cache.put('token', token);
              dfrd.resolve({
                token: token,
                cached: false
              });
            }
          }
        });
    return dfrd.promise;
  },

  /**
   * Retrieves a list of Filters as an array.  Each item in the array is of type Filter.  Example:
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
    var token = cache.get('token'),
        dfrd = Q.defer(),
        extractFilters = function extractFilters(xml) {
          var parser = xml2js.Parser(), r;
          parser.parseString(xml, function (err, res) {
            if (err) {
              dfrd.reject(MODULE_ERRORS.xml_parse_error);
              return;
            }
            if (res.response.error) {
              dfrd.reject(res.response.error);
              return;
            }
            r = res;
          });
          if (r) {
            return r.response.filters[0].filter
                .map(function (filter) {
                  return new Filter({
                    name: filter._.trim(),
                    type: filter.$.type,
                    id: filter.$.sFilter,
                    url: format('%s://%s/default.asp?pgx=LF&ixFilter=%s',
                        PROTOCOL, conf.host, filter.$.sFilter)
                  });
                });
          }
        };

    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.listFilters, PROTOCOL, conf.host, token),
          function (err, res, body) {
            var filters;
            if (err) {
              dfrd.reject(err);
            }
            else {
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
   * @returns {Function|promise|Q.promise}
   */
  setCurrentFilter: function setCurrentFilter(filter) {
    var token = cache.get('token'),
        dfrd = Q.defer(), id;
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    }
    else {
      id = typeof filter === 'string' ? filter : filter.id;
      request(format(URLs.setCurrentFilter, PROTOCOL, conf.host, id,
          token), function (err, res, body) {
        if (err) {
          dfrd.reject(err)
        }
        else {
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
   * @returns {Function|promise|Q.promise} Promise
   */
  search: function search(query, cols, max) {
    var token = cache.get('token'),
        dfrd = Q.defer(),
        extractCases = function extractCases(xml) {
          var parser = xml2js.Parser(), r;
          parser.parseString(xml, function (err, res) {
            if (err) {
              dfrd.reject(MODULE_ERRORS.xml_parse_error);
              return;
            }
            if (res.response.error) {
              dfrd.reject(res.response.error);
              return;
            }
            r = res;
          });
          if (r) {
            return r.response.cases[0]['case'].map(function (kase) {
              return new Case({
                id: kase.$.ixBug,
                operations: kase.$.operations.split(','),
                title: kase.sTitle[0].trim(),
                status: kase.sStatus[0].trim(),
                url: format('%s://%s/default.asp?%s', PROTOCOL, conf.host,
                    kase.$.ixBug)
              });
            });
          }
        };
    cols = (cols || DEFAULT_COLS).join(',');
    max = max || DEFAULT_MAX;
    query = encodeURIComponent(query);
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.search, PROTOCOL, conf.host, query, cols, max,
          token),
          function (err, res, body) {
            var cases;
            if (err) {
              dfrd.reject(err);
            } else {
              cases = extractCases(body);
              if (!cases) {
                dfrd.reject(MODULE_ERRORS.unknown);
              }
              else {
                dfrd.resolve(cases);
              }
            }
          });
    }
    return dfrd.promise;

  },

  /**
   * Gets a bug by ID
   * @param {string|number} id ID of bug
   * @param {number} [cols] Cols to pull; defaults to everything
   * @returns {Function|promise|Q.promise}
   */
  getBug: function getBug(id, cols) {
    return this.search(id, cols || COLS, 1);
  }
};

/**
 * Filter pseudoclass
 * @class Filter
 * @constructor
 * @param {Object} obj Object representing Filter
 */
var Filter = function Filter(obj) {
  extend(this, obj);
};
/**
 * Sets the current filter to be this Filter
 * @method setCurrent
 * @returns {Function|promise|Q.promise}
 */
Filter.prototype.setCurrent = function () {
  return fogbugz.setCurrentFilter(this);
};

/**
 * Case pseudoclass
 * @class Case
 * @constructor
 * @param {Object} obj Object representing Case
 */
var Case = function Case(obj) {
  extend(this, obj);
};

module.exports = fogbugz;
module.exports.Filter = Filter;
module.exports.Case = Case;
