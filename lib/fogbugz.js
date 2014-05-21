'use strict';

/**
 * @module fogbugz
 * @title fogbugz
 * @overview Provides FogBugz API functionality.
 * @author Christopher Hiller <chiller@badwing.com>
 * @version 0.3.0
 * @license MIT
 */
var request = require('request'),
  Q = require('q'),
  fs = require('fs'),
  path = require('path'),
  format = require('util').format,
  xml2js = require('xml2js'),
  _ = require('lodash-node'),
  cache = require('memory-cache'),

  conf = {
    host: process.env.FOGBUGZ_HOST,
    username: process.env.FOGBUGZ_USERNAME,
    password: process.env.FOGBUGZ_PASSWORD
  },

  parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    trim: true
  });

/**
 * Default protocol
 * @type {string}
 */
var PROTOCOL = 'https';

/**
 * Internal error strings.
 */
var MODULE_ERRORS = {
  undefined_token: 'token is undefined; you are not logged in',
  xml_parse_error: 'invalid xml received from server',
  unknown: 'unknown error',
  request: 'request failure',
  unknown_method: 'unknown method',
  empty_search: 'query returned no results'
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

var req = function req(obj) {
  var url,
    query,
    token = getToken();

  if (_.isString(obj)) {
    obj = {
      cmd: obj
    };
  }
  if (obj.cmd !== 'logon' && !token) {
    return Q.reject(MODULE_ERRORS.undefined_token).nodeify();
  }

  query = _(obj)
    .pairs()
    .tap(function (value) {
      if (token) {
        value.push(['token', token]);
      }
    })
    .map(function (pair) {
      return pair.join('=');
    })
    .join('&');

  url = format.apply(null,
    ['%s://%s/api.asp?%s', PROTOCOL, conf.host].concat(query));

  return Q.npost(request, url)
    .catch(function (err) {
      return format('request failure: %s', err);
    })
    .then(function() {
      console.dir(arguments);
    })
    .get('body')
    .then(function (body) {
      return Q.ninvoke(parser, 'parseString', body)
        .catch(function () {
          return MODULE_ERRORS.xml_parse_error;
        })
        .get('response')
        .then(function (json) {
          if (json.error) {
            return Q.reject(format('fogbugz error: %s', json.error));
          }
        })
    })
    .nodeify();
};

var getToken = function getToken() {
  return cache.get('token')
};

/**
 * Forgets the stored token.
 * @method forgetToken
 */
var forgetToken = function forgetToken() {
  cache.del('token');
};

/**
 * Manually sets a login token if you have one by some other means.
 * @see fogbugz.logon
 * @method setToken
 * @param {string} token FogBugz API logon token
 */
var setToken = function setToken(token) {
  cache.put('token', token);
};

var fogbugz = {
  MODULE_ERRORS: MODULE_ERRORS,

  request: req,
  getToken: getToken,
  forgetToken: forgetToken,
  setToken: setToken,

  /**
   * Assuming you are logged in and have a cached token, this will log you out.
   * @method logoff
   * @returns {Q.promise} Promise
   */
  logoff: function logoff() {
    return req('logoff')
      .nodeify();
  },

  /**
   * Logs you into FogBugz based on contents of `fogbugz.conf.json`.
   * @method logon
   * @returns {Q.promise} Promise
   */
  logon: function logon() {
    var token = getToken();

    if (token) {
      return Q(token).nodeify();
    }
    return req({
      cmd: 'logon',
      email: conf.username,
      password: conf.password
    })
      .get('token')
      .then(function (token) {
        setToken(token);
      })
      .nodeify();
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
   * @returns {Q.promise} Promise
   */
  listFilters: function listFilters() {
    return req('listFilters')
      .get('filters')
      .then(function (filters) {
        return _.map(filters, function (filter) {
          return new Filter({
            name: filter._,
            type: filter.type,
            id: filter.sFilter,
            url: format('%s://%s/default.asp?pgx=LF&ixFilter=%s',
              PROTOCOL, conf.host, filter.sFilter)
          });
        });
      })
      .nodeify();
  },

  /**
   * Sets the current Filter. I'm not sure what this does exactly.
   * @method setCurrentFilter
   * @param {Filter|string} filter Filter object or string ID
   * @see class fogbugz.Filter
   * @returns {Q.promise}
   */
  setCurrentFilter: function setCurrentFilter(filter) {
    if (filter instanceof Filter) {
      filter = filter.id;
    }
    return req('setCurrentFilter', filter)
      .nodeify();
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
    return req({
      cmd: 'search',
      q: encodeURIComponent(query),
      cols: (cols || DEFAULT_COLS).toString(),
      max: max || DEFAULT_MAX
    })
      .get('cases')
      .then(function (cases) {
        if (cases.count == 0) {
          return Q.reject(MODULE_ERRORS.empty_search);
        }
        return cases['case'].map(function (kase) {
            var bug = new Case({
              id: kase.ixBug,
              operations: kase.operations.split(','),
              title: kase.sTitle,
              status: kase.sStatus,
              url: format('%s://%s/default.asp?%s', PROTOCOL, conf.host,
                kase.ixBug),
              fixFor: kase.sFixFor
            });
            if (kase.sPersonAssignedTo) {
              bug.assignedTo = kase.sPersonAssignedTo;
              bug.assignedToEmail = kase.sEmailAssignedTo;
            }
          if (kase.tags && kase.tags.tag) {
            bug.tags = kase.tags.tag.join(', ');
            }
            // find anything leftover in the case, disregarding the fields we
            // already
            _(kase)
              .keys()
              .difference(_.keys(bug).concat('sTitle', 'sStatus',
                'sFixFor', 'sPersonAssignedTo',
                'sEmailAssignedTo'))
              .each(function (key) {
                bug[key] = kase[key];
              });
            bug._raw = kase;
            return bug;
          });
      })
      .nodeify();
  },

  /**
   * Gets a bug by ID
   * @param {string|number} id ID of bug
   * @param {number} [cols] Cols to pull
   * @returns {Function|promise|Q.promise}
   */
  getBug: function getBug(id, cols) {
    return req({
      cmd: 'search',
      q: id,
      cols: cols || DEFAULT_COLS,
      max: 1
    })
      .nodeify();
  }
};

/**
 * Filter pseudoclass
 * @class Filter
 * @constructor
 * @param {Object} obj Object representing Filter
 */
var Filter = function Filter(obj) {
  _.extend(this, obj);
};
/**
 * Sets the current filter to be this Filter
 * @method setCurrent
 * @returns {Function|promise|Q.promise}
 */
Filter.prototype.setCurrent = function () {
  return fogbugz.setCurrentFilter(this)
    .nodeify();
};

/**
 * Case pseudoclass
 * @class Case
 * @constructor
 * @param {Object} obj Object representing Case
 */
var Case = function Case(obj) {
  _.extend(this, obj);
};

module.exports = fogbugz;
module.exports.Filter = Filter;
module.exports.Case = Case;
