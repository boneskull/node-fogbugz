module.exports = function (grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: require('./package.json'),
    jasmine_node: {
      projectRoot: "./spec"
    }
  });

  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-jasmine-node');

  // Default task(s).
  grunt.registerTask('test', ['jasmine_node']);
  grunt.registerTask('default', ['test']);

};
