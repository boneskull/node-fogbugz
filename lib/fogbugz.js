'use strict';

var request = require('request'),
    Q = require('q'),
    conf = require('../fogbugz.conf.json'),
    format = require('util').format,
    extend = require('util')._extend,
    xml2js = require('xml2js'),
    cache = require('memory-cache'),

    PROTOCOL = 'https',
    URLs = {
      logon: '%s://%s/api.asp?cmd=logon&email=%s&password=%s',
      logoff: '%s://%s/api.asp?cmd=logoff&token=%s',
      listFilters: '%s://%s/api.asp?cmd=listFilters&token=%s',
      setCurrentFilter: '%s://%s/api.asp?cmd=setCurrenFilter&sFilter=%s&token=%s'
    },
    MODULE_ERRORS = {
      undefined_token: 'token is undefined; you are not logged in',
      xml_parse_error: 'invalid xml received from server',
      unknown: 'unknown error'
    },

    Filter,

    extractEmptyResponse = function extractEmptyResponse(xml, dfrd) {
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
    },

    fogbugz = {
      MODULE_ERRORS: MODULE_ERRORS,

      forgetToken: function forgetToken() {
        cache.del('token');
      },

      setToken: function setToken(token) {
        cache.put('token', token);
      },

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
              console.log(err);
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
                        name: filter._,
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
                console.log(body);
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
              extractEmptyResponse(body, dfrd);
              dfrd.resolve(true);
            }
          });
        }
        return dfrd.promise;
      }
    };

Filter = function (o) {
  extend(this, o);
};

Filter.prototype.setCurrent = function () {
  fogbugz.setCurrentFilter(this);
};


module.exports = fogbugz;
