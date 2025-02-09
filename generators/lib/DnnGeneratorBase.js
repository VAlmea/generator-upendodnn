'use strict';
const Generator = require('yeoman-generator');
const chalk = require('chalk');
const uuid = require('uuid-v4');
const pascalCase = require('pascal-case');
const which = require('which');
const fs = require('fs');

module.exports = class DnnGeneratorBase extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // This method adds support for a `--test` flag
    this.option('noinstall');
  }

  _hasYarn() {
    return which.sync('yarn', { nothrow: true }) !== undefined;
  }

  _generateGuid() {
    var guid = uuid();
    return guid.toUpperCase();
  }

  _pascalCaseName(val) {
    return pascalCase(val);
  }

  _createSolutionFromTemplate() {
    this.log(chalk.white('Creating sln.'));
    let namespace = this._getNamespace();
    var folderPath = this.destinationPath(this.props.moduleName);
    return this.spawnCommandSync('dotnet', [
      'new',
      'sln',
      '-n',
      namespace,
      '-o',
      folderPath
    ]);
  }

  _addProjectToSolution() {
    let namespace = this._getNamespace();
    this.log(chalk.white('Adding project to sln.'));
    if (this.props.extensionName == undefined) {
      this.props.extensionName = this.props.moduleName;
    }
    this.destinationRoot();
    this.spawnCommandSync('dotnet', [
      'sln',
      this.destinationPath('..'),
      'add',
      this.destinationPath(`${this.props.extensionName}/${namespace}.csproj`)
    ]);
  }

  _writeSolution() {
    let namespace = this._getNamespace();
    let slnFileName = this.destinationPath(namespace + '.sln');
    this.log(
      chalk.white(
        'Looking for sln [' + slnFileName + ']. Result: ' + this.fs.exists(slnFileName)
      )
    );
    if (this.fs.exists(slnFileName) === false) {
      this._createSolutionFromTemplate();
    }
  }

  _installDependencies() {
    if (!this.options.noinstall) {
      let hasYarn = this._hasYarn();
      if (this.props.extensionName == undefined) {
        this.props.extensionName = this.props.moduleName;
      }
      this.destinationRoot();
      var path = this.destinationPath(this.props.extensionName);      
      console.log("Installing npm dependencies in " + path);
      if (hasYarn) {
        this.spawnCommandSync('yarn', ['install'], { cwd: path })
      } else {
        this.spawnCommandSync('npm', ['install'], { cwd: path })
      }
      this.log(chalk.white('Installed npm Dependencies.'));
    }
  }

  _restoreSolution() {
    this.log(chalk.white('Running dotnet restore.'));
    let namespace = this._getNamespace();
    if (this.props.extensionName == undefined) {
      this.props.extensionName = this.props.moduleName;
    }
    this.destinationRoot();
    var path = this.destinationPath(this.props.extensionName);
    this.spawnCommandSync('dotnet', ['restore', namespace + ".csproj"], { cwd: path });
  }

  _copyCommon(namespace, moduleName) {
    this.fs.copyTpl(
      this.templatePath('../../gulp/*.js'),
      this.destinationPath(moduleName + '/_BuildScripts/gulp/'),
      {
        namespace: namespace,
        moduleName: moduleName
      }
    );
  }

  _getNamespace() {
    let namespace = this.props.namespace;
    if (this.props.extensionType != undefined && this.props.extensionType != "") {
      namespace = namespace + "." + this.props.extensionType;
    }
    if (this.props.extensionName == undefined) this.props.extensionName = this.props.moduleName;
    namespace = namespace + "." + this.props.extensionName;
    return namespace;
  }

  _defaultInstall() {
    if (!this.options.noinstall) {
      let hasYarn = this._hasYarn();
      if (this.props.extensionName == undefined) this.props.extensionName = this.props.moduleName;
      process.chdir(this.props.extensionName);
      this.installDependencies({ npm: !hasYarn, bower: false, yarn: hasYarn });
    }
  }

  _writeJsConfig() {
    this.fs.extendJSON(this.destinationPath(this.props.moduleName + '/jsconfig.json'), {
      compilerOptions: {
        target: 'es6',
        module: 'commonjs',
        allowSyntheticDefaultImports: true
      },
      exclude: ['node_modules']
    });
  }

  _writeTsConfig() {
    this.fs.extendJSON(this.destinationPath(this.props.moduleName + '/tsconfig.json'), {
      compilerOptions: {
        module: 'es6',
        target: 'es6',
        moduleResolution: 'node',
        baseUrl: 'src',
        allowSyntheticDefaultImports: true,
        noImplicitAny: false,
        sourceMap: true,
        outDir: 'ts-build',
        jsx: 'react'
      },
      exclude: ['node_modules']
    });
  }

  _writeBabelRc() {
    this.fs.extendJSON(this.destinationPath(this.props.moduleName + '/.babelrc'), {
      presets: ['@babel/preset-env', '@babel/preset-react'],
      plugins: [
        '@babel/plugin-transform-object-assign',
        '@babel/plugin-proposal-object-rest-spread'
      ],
      env: {
        production: {
          plugins: ['transform-react-remove-prop-types']
        }
      }
    });
  }

  _createYarnWorkspace() {
    if (!this._hasYarn()) return;

    const workspaceJson = {
      name: this.props.namespace,
      version: '1.0.0',
      description: 'Project workspace',
      private: true,
      workspaces: [this.props.moduleName],
      scripts: {
        // eslint-disable-next-line prettier/prettier
        'test': 'lerna run test',
        // eslint-disable-next-line prettier/prettier
        'clean': 'lerna run clean',
        // eslint-disable-next-line prettier/prettier
        'build': 'lerna run build',
        // eslint-disable-next-line prettier/prettier
        'build-client': 'lerna run build-client',
        // eslint-disable-next-line prettier/prettier
        'package': 'lerna run package'
      },
      devDependencies: {
        // eslint-disable-next-line prettier/prettier
        'browser-sync': '^2.26.3'
      },
      dependencies: {
        // eslint-disable-next-line prettier/prettier
        'lerna': '^3.8.4'
      }
    };

    this.fs.extendJSON(this.destinationPath('package.json'), workspaceJson);

    const lernaJson = {
      lerna: '3.8.4',
      npmClient: 'yarn',
      packages: [this.props.moduleName],
      version: '1.0.0'
    };

    this.fs.extendJSON(this.destinationPath('lerna.json'), lernaJson);
  }

  _getMsBuildVersion() {
    var msBuildVersion = "";

    try {
      // TODO: Remove the ones that don't matter
      if (fs.existsSync("C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\MSBuild\\Microsoft\\VisualStudio\\v16.0\\WebApplications\\Microsoft.WebApplication.targets") ||
        fs.existsSync("C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Professional\\MSBuild\\Microsoft\\VisualStudio\\v16.0\\WebApplications\\Microsoft.WebApplication.targets") ||
        fs.existsSync("C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Enterprise\\MSBuild\\Microsoft\\VisualStudio\\v16.0\\WebApplications\\Microsoft.WebApplication.targets") ||
        fs.existsSync("C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\MSBuild\\Microsoft\\VisualStudio\\v16.0\\WebApplications\\Microsoft.WebApplication.targets")) {
        msBuildVersion = "16"; // VS 2019 Community
      }

      if (fs.existsSync("C:\\Program Files (x86)\\MSBuild\\Microsoft\\VisualStudio\\v14.0\\WebApplications\\Microsoft.WebApplication.targets")) {
        msBuildVersion = "14"; // VS 2015
      }

      if (fs.existsSync("C:\\Program Files (x86)\\MSBuild\\Microsoft\\VisualStudio\\v12.0\\WebApplications\\Microsoft.WebApplication.targets")) {
        msBuildVersion = "13"; // VS 2013
      }

      if (fs.existsSync("C:\\Program Files (x86)\\MSBuild\\Microsoft\\VisualStudio\\v11.0\\WebApplications\\Microsoft.WebApplication.targets")) {
        msBuildVersion = "11"; // VS 2012?
      }

      if (msBuildVersion == "") {
        this.log(chalk.red("YIKES! A valid version of MSBuild was not found! This is a critical error... :("));
      }

      return msBuildVersion;
    } catch (err) {
      // if the file doesn't exist, this exception will occur, because the fs.existsSync method is blocking
      return "";
    }
  }
};
