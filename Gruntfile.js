'use strict';

module.exports = function (grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: require('./package.json'),
    jasmine_node: {
      projectRoot: './spec'
    },
    bump: {
      options: {
        files: ['package.json'],
        commit: true,
        commitMessage: 'Release v%VERSION%',
        commitFiles: ['package.json'],
        createTag: true,
        tagName: 'v%VERSION%',
        tagMessage: 'Version %VERSION%',
        push: false,
        gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d'
      }
    },
    eslint: {
      main: [
        'Gruntfile.js',
        'index.js',
        'spec/**/*.js'
      ]
    }
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-jasmine-node');
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks('grunt-eslint');

  // Default task(s).
  grunt.registerTask('test', ['eslint', 'jasmine_node']);
  grunt.registerTask('default', ['test']);

};
