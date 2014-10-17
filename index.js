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
 Create a `fogbugz.conf.json` in your app's root directory.  It should look like this:

 ```json
 {
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
 * @version 0.2.0
 * @license MIT
 */
var request = require('request'),
  Q = require('q'),
  fs = require('fs'),
  path = require('path'),
  conf = require(path.join(process.env.PWD, 'fogbugz.conf.json')),
  format = require('util').format,
  extend = require('util')._extend,
  xml2js = require('xml2js'),
  _ = require('lodash-node'),
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
  edit: '%s://%s/api.asp?cmd=edit&token=%s&ixBug=%s&cols=%s',
  logon: '%s://%s/api.asp?cmd=logon&email=%s&password=%s',
  logoff: '%s://%s/api.asp?cmd=logoff&token=%s',
  listAreas: '%s://%s/api.asp?cmd=listAreas&token=%s&fWrite=1',
  listFilters: '%s://%s/api.asp?cmd=listFilters&token=%s',
  listPeople: '%s://%s/api.asp?cmd=listPeople&token=%s',
  listPriorities: '%s://%s/api.asp?cmd=listPriorities&token=%s',
  listProjects: '%s://%s/api.asp?cmd=listProjects&token=%s&fWrite=1',
  listStatuses: '%s://%s/api.asp?cmd=listStatuses&token=%s',
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

/**
 * All possible fields returned for a case
 * @type {Array}
 */
var COLS = [
  'dFixFor',
  'dtClosed',
  'dtDue',
  'dtLastUpdated',
  'dtLastView',
  'dtOpened',
  'dtResolved',
  'fForwarded',
  'fOpen',
  'fReplied',
  'fScoutStopReporting',
  'fSubscribed',
  'hrsCurrentEst',
  'hrsElapsed',
  'hrsOrigEst',
  'iPersonClosedBy',
  'ixArea',
  'ixBug',
  'ixBugChildren',
  'ixBugEventLastView',
  'ixBugEventLatest',
  'ixBugEventlatestText',
  'ixBugParent',
  'ixCategory',
  'ixDiscussTopic',
  'ixFixFor',
  'ixGroup',
  'ixMailbox',
  'ixPersonAssignedTo',
  'ixPersonLastEditedBy',
  'ixPersonOpenedBy',
  'ixPersonResolvedBy',
  'ixPriority',
  'ixProject',
  'ixRelatedBugs',
  'ixStatus',
  'sArea',
  'sCategory',
  'sComputer',
  'sEmailAssignedTo',
  'sFixFor',
  'sLatestTextSummary',
  'sOriginalTitle',
  'sPersonAssignedTo',
  'sPriority',
  'sProject',
  'sReleaseNotes',
  'sScoutDescription',
  'sScoutMessage',
  'sStatus',
  'sTicket',
  'sTitle',
  'sVersion',
  'tags'
];

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

/**
 * Parses XML and returns JSON.
 * @param {string} xml XML string
 * @returns {Object} JSON representation of XML
 */
var _parse = function _parse(xml) {
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
  return r;
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
        var r = _parse(xml);
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
        var r = _parse(xml);
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
   * Retrieves a list of Projects as an array.  Each item in the array is of type Project.
   ```
   [{
      "url":"https://.../default.asp?pgx=FS&ixProject=34",
      "fDeleted":"false",
      "ixWorkflow":"2",
      "fInbox":"false",
      "sPhone":"",
      "sEmail":"...@example.com",
      "sPersonOwner":"Example Owner",
      "ixPersonOwner":"1",
      "sProject":"Example Project",
      "ixProject":"34"
    },
    { ... }]
   ```
   * @method listProjects
   * @returns {Function|promise|Q.promise} Promise
   */
  listProjects: function listProjects() {
    var token = cache.get('token'),
      dfrd = Q.defer(),
      extractProjects = function extractProjects(xml) {
        var r = _parse(xml);
        if (r) {
          return r.response.projects[0].project
            .map(function(project) {
              return new Project({
                ixProject: project.ixProject[0],
                sProject: project.sProject[0],
                ixPersonOwner: project.ixPersonOwner[0],
                sPersonOwner: project.sPersonOwner[0],
                sEmail: project.sEmail[0],
                sPhone: project.sPhone[0],
                fInbox: project.fInbox[0],
                ixWorkflow: project.ixWorkflow[0],
                fDeleted: project.fDeleted[0],
                url: format('%s://%s/default.asp?pgx=FS&ixProject=%s',
                  PROTOCOL, conf.host, project.ixProject)
              });
            });
        }
      };
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.listProjects, PROTOCOL, conf.host, token),
        function(err, res, body) {
          var projects;
          if (err) {
            dfrd.reject(err);
          } else {
            projects = extractProjects(body);
            if (projects && projects.length) {
              dfrd.resolve(projects);
            } else {
              dfrd.reject(MODULE_ERRORS.unknown);
            }
          }
        });
    }
    return dfrd.promise;
  },
  /**
   * Retrieves a list of Areas as an array.  Each item in the array is of type Area.
   ```
   [{ url: 'https://www.***.com/default.asp?pgx=FS&ixArea=14=304',
      cDoc: '0',
      nType: '0',
      sProject: 'Example Project',
      ixPersonOwner: '',
      sPersonOwner: '',
      ixProject: '34',
      sArea: '#Inbox',
      ixArea: '304' },{
        ...
      }]
   ```
   * @method listAreas
   * @returns {Function|promise|Q.promise} Promise
   */
  listAreas: function listAreas() {
    var token = cache.get('token'),
      dfrd = Q.defer(),
      extractAreas = function extractAreas(xml) {
        var r = _parse(xml);
        if (r) {
          return r.response.areas[0].area
            .map(function(area) {
              return new Area({
                ixArea: area.ixArea[0],
                sArea: area.sArea[0],
                ixProject: area.ixProject[0],
                sPersonOwner: area.sPersonOwner[0],
                ixPersonOwner: area.ixPersonOwner[0],
                sProject: area.sProject[0],
                nType: area.nType[0],
                cDoc: area.cDoc[0],
                url: format('%s://%s/default.asp?pgx=FS&ixArea=14=%s',
                  PROTOCOL, conf.host, area.ixArea)
              });
            });
        }
      };
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.listAreas, PROTOCOL, conf.host, token),
        function(err, res, body) {
          var areas;
          if (err) {
            dfrd.reject(err);
          } else {
            areas = extractAreas(body);
            if (areas && areas.length) {
              dfrd.resolve(areas);
            } else {
              dfrd.reject(MODULE_ERRORS.unknown);
            }
          }
        });
    }
    return dfrd.promise;
  },
  /**
   * Retrieves a list of Priorities as an array.  Each item in the array is of type Priorities.
   ```
   [{ sPriority: 'Critical', fDefault: 'false', ixPriority: '1' },{}]
   ```
   * @method listPriorities
   * @returns {Function|promise|Q.promise} Promise
   */
  listPriorities: function listPriorities() {
    var token = cache.get('token'),
      dfrd = Q.defer(),
      extractPriorities = function extractPriorities(xml) {
        var r = _parse(xml);
        if (r) {
          return r.response.priorities[0].priority
            .map(function(priority) {
              return new Priority({
                ixPriority: priority.ixPriority[0],
                fDefault: priority.fDefault[0],
                sPriority: priority.sPriority[0]
              });
            });
        }
      };
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.listPriorities, PROTOCOL, conf.host, token),
        function(err, res, body) {
          var priorities;
          if (err) {
            dfrd.reject(err);
          } else {
            priorities = extractPriorities(body);
            if (priorities && priorities.length) {
              dfrd.resolve(priorities);
            } else {
              dfrd.reject(MODULE_ERRORS.unknown);
            }
          }
        });
    }
    return dfrd.promise;
  },
  /**
   * Retrieves a list of People as an array.  Each item in the array is of type People.
   ```
   ```
   * @method listPeople
   * @returns {Function|promise|Q.promise} Promise
   */
  listPeople: function listPeople() {
    var token = cache.get('token'),
      dfrd = Q.defer(),
      extractPeople = function extractPeople(xml) {
        var r = _parse(xml);
        if (r) {
          return r.response.people[0].person
            .map(function(person) {
              return new Person({
                ixPerson: person.ixPerson[0],
                sFullName: person.sFullName[0],
                sEmail: person.sEmail[0],
                sPhone: person.sPhone[0],
                fAdministrator: person.fAdministrator[0],
                fCommunity: person.fCommunity[0],
                fVirtual: person.fVirtual[0],
                fDeleted: person.fDeleted[0],
                fNotify: person.fNotify[0],
                sHomepage: person.sHomepage[0],
                sLocale: person.sLocale[0],
                sLanguage: person.sLanguage[0],
                sTimeZoneKey: person.sTimeZoneKey[0],
                sLDAPUid: person.sLDAPUid[0],
                dtLastActivity: person.dtLastActivity[0],
                fRecurseBugChildren: person.fRecurseBugChildren[0],
                fPaletteExpanded: person.fPaletteExpanded[0],
                ixBugWorkingOn: person.ixBugWorkingOn[0],
                sFrom: person.sFrom[0]
              });
            });
        }
      };
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.listPeople, PROTOCOL, conf.host, token),
        function(err, res, body) {
          var people;
          if (err) {
            dfrd.reject(err);
          } else {
            people = extractPeople(body);
            if (people && people.length) {
              dfrd.resolve(people);
            } else {
              dfrd.reject(MODULE_ERRORS.unknown);
            }
          }
        });
    }
    return dfrd.promise;
  },

  /**
   * Retrieves a list of Statuses as an array.  Each item in the array is of type Statuses.
   ```
   [{ iOrder: '0',
      fDeleted: 'false',
      fDuplicate: 'false',
      fResolved: 'false',
      fWorkDone: 'false',
      ixCategory: '1',
      sStatus: 'Active',
      ixStatus: '1' },
    {
  
    }]

   ```
   * @method listStatuses
   * @returns {Function|promise|Q.promise} Promise
   */
  listStatuses: function listStatuses() {
    var token = cache.get('token'),
      dfrd = Q.defer(),
      extractStatus = function extractStatus(xml) {
        var r = _parse(xml);
        if (r) {
          return r.response.statuses[0].status
            .map(function(status) {
              return new Status({
                ixStatus: status.ixStatus[0],
                sStatus: status.sStatus[0],
                ixCategory: status.ixCategory[0],
                fWorkDone: status.fWorkDone[0],
                fResolved: status.fResolved[0],
                fDuplicate: status.fDuplicate[0],
                fDeleted: status.fDeleted[0],
                iOrder: status.iOrder[0]
              });
            });
        }
      };
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      request(format(URLs.listStatuses, PROTOCOL, conf.host, token),
        function(err, res, body) {
          var status;
          if (err) {
            dfrd.reject(err);
          } else {
            status = extractStatus(body);
            if (status && status.length) {
              dfrd.resolve(status);
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
      cases, fields,
      dfrd = Q.defer(),
      extractCases = function extractCases(xml) {
        var r = _parse(xml);
        if (!r || !r.response || !r.response.cases.length ||
          !r.response.cases[0]['case']) {
          return dfrd.reject('could not find bug');
        }
        else {
          cases = r.response.cases[0]['case'].map(function (kase) {
            var bug = new Case({
              id: kase.$.ixBug,
              operations: kase.$.operations.split(','),
              title: kase.sTitle[0].trim(),
              status: kase.sStatus[0].trim(),
              url: format('%s://%s/default.asp?%s', PROTOCOL, conf.host,
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
              .each(function (key) {
                var value = kase[key];
                bug[key] = _.isArray(value) && value.length === 1 ?
                           bug[key] = value[0].trim() : // dereference
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
      };
    fields = (cols || DEFAULT_COLS).join(',');
    max = max || DEFAULT_MAX;
    query = encodeURIComponent(query);
    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      var url = format(URLs.search, PROTOCOL, conf.host, query, fields, max,
        token);
      request(url, function (err, res, body) {
        var cases;
        if (err) {
          dfrd.reject(err);
        } else {
          cases = extractCases(body);
          if (!cases) {
            console.error(body);
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
   * Edit a bug by ID
   * @method editBug
   * @param {number} [id] -- the ixBug of a case that you want edit
   * @param {Object} [parameters] -- the parameters you want edit
   * @param {array} [cols] The columns you want returned about this case
   * @returns {Function|promise|Q.promise} Promise
   */
  editBug: function editBug(id, parameters, cols) {
    var token = cache.get('token'),
      cases, fields,
      dfrd = Q.defer(),
      extractCases = function extractCases(xml) {
        var r = _parse(xml);
        if (!r || !r.response || !r.response.case ||
          !r.response.case.length ) {
          return dfrd.reject('could not find bug');
        } else {
          cases = r.response.case.map(function(kase) {
            var bug = new Case({
              id: kase.$.ixBug,
              operations: kase.$.operations.split(','),
              title: kase.sTitle[0].trim(),
              status: kase.sStatus[0].trim(),
              url: format('%s://%s/default.asp?%s', PROTOCOL, conf.host,
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
                  bug[key] = value[0].trim() : // dereference
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
      };
    fields = cols.concat(DEFAULT_COLS).join(',');
    id = encodeURIComponent(id);

    if (!token) {
      dfrd.reject(MODULE_ERRORS.undefined_token);
    } else {
      var url = format(URLs.edit, PROTOCOL, conf.host, token, id, fields);
      // Some work need to do, parameters .....
      Object.keys(parameters).forEach(function(k) {
        url += '&' + k + '=' + parameters[k];
      });
      request(url, function(err, res, body) {
        var cases;
        if (err) {
          dfrd.reject(err);
        } else {
          cases = extractCases(body);
          if (!cases) {
            console.error(body);
            dfrd.reject(MODULE_ERRORS.unknown);
          } else {
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
   * @param {number} [cols] Cols to pull
   * @returns {Function|promise|Q.promise}
   */
  getBug: function getBug(id, cols) {
    return this.search(id, cols, 1);
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
 * Project pseudoclass
 * @class Project
 * @constructor
 * @param {Object} obj Object representing Project
 */
var Project = function Project(obj) {
  extend(this, obj);
};

/**
 * Area pseudoclass
 * @class Area
 * @constructor
 * @param {Object} obj Object representing Area
 */
var Area = function Area(obj) {
  extend(this, obj);
};

/**
 * Priority pseudoclass
 * @class Priority
 * @constructor
 * @param {Object} obj Object representing Priority
 */
var Priority = function Priority(obj) {
  extend(this, obj);
};

/**
 * Person pseudoclass
 * @class Person
 * @constructor
 * @param {Object} obj Object representing Person
 */
var Person = function Person(obj) {
  extend(this, obj);
};

/**
 * Status pseudoclass
 * @class Status
 * @constructor
 * @param {Object} obj Object representing Status
 */
var Status = function Status(obj) {
  extend(this, obj);
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
