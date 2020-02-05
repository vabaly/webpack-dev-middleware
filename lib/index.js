'use strict';

const mime = require('mime');

const middleware = require('./middleware');
const reporter = require('./utils/reporter');
const {
  setupHooks,
  setupRebuild,
  setupLogger,
  setupWriteToDisk,
  setupOutputFileSystem,
  getFilenameFromUrl,
  ready,
} = require('./utils');

const noop = () => {};

const defaults = {
  logLevel: 'info',
  logTime: false,
  logger: null,
  mimeTypes: null,
  reporter,
  stats: {
    colors: true,
    context: process.cwd(),
  },
  watchOptions: {
    aggregateTimeout: 200,
  },
  writeToDisk: false,
};

/**
 * @param {Compiler} compiler webpack compiler 实例
 * @param {Object} opts webpack dev server 配置
 *                      在 webpack dev server CLI 单元测试中，这个配置如下所示：
                        {
                            "host": "localhost",
                            "publicPath": "/",
                            "clientLogLevel": "info",
                            "stats": {
                                "cached": false,
                                "cachedAssets": false
                            },
                            "port": 8080,
                            "contentBase": "/Users/solar/Desktop/project/webpack-dev-server",
                            "contentBasePublicPath": "/",
                            "transportMode": {
                                "server": "sockjs",
                                "client": "sockjs"
                            },
                            "watchOptions": {},
                            "logLevel": "info"
                        }
 */
module.exports = function wdm(compiler, opts) {
  // 再加入一点配置
  const options = Object.assign({}, defaults, opts);

  // defining custom MIME type
  if (options.mimeTypes) {
    const typeMap = options.mimeTypes.typeMap || options.mimeTypes;
    const force = Boolean(options.mimeTypes.force);

    mime.define(typeMap, force);
  }

  // 1. 这个上下文变量肯定有很多用处
  const context = {
    state: false,
    webpackStats: null,
    callbacks: [],
    options,
    compiler,
    watching: null,
    forceRebuild: false,
  };

  // 初始化钩子函数
  setupHooks(context);
  // 把 rebuild 函数挂载在 context 上
  setupRebuild(context);
  setupLogger(context);

  // start watching
  // 如果 options.lazy 没配置的话，那么就开始 watch 了
  if (!options.lazy) {
    // compiler.watch 实际上是调用原型（Tapable 对象）上的 .watch 方法
    // 【Todo】这个方法底层源码还没看完，主要是根据文章的描述，知道是如下作用：
    // 1. 首先对本地文件代码进行编译打包，也就是 webpack 的一系列编译流程
    // 2. 其次编译结束后，开启对本地文件的监听，当文件发生变化，重新编译，编译完成之后继续监听
    // 3. 监听本地文件的变化主要是通过 文件的生成时间 是否有变化
    // 4. 编译打包的文件保存在内存中
    context.watching = compiler.watch(options.watchOptions, (err) => {
      if (err) {
        context.log.error(err.stack || err);

        if (err.details) {
          context.log.error(err.details);
        }
      }
    });
  } else {
    if (typeof options.filename === 'string') {
      const filename = options.filename
        .replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&') // eslint-disable-line no-useless-escape
        .replace(/\\\[[a-z]+\\\]/gi, '.+');

      options.filename = new RegExp(`^[/]{0,1}${filename}$`);
    }

    context.state = true;
  }

  if (options.writeToDisk) {
    setupWriteToDisk(context);
  }

  setupOutputFileSystem(compiler, context);

  return Object.assign(middleware(context), {
    close(callback) {
      // eslint-disable-next-line no-param-reassign
      callback = callback || noop;

      if (context.watching) {
        context.watching.close(callback);
      } else {
        callback();
      }
    },

    context,

    fileSystem: context.fs,

    getFilenameFromUrl: getFilenameFromUrl.bind(
      this,
      context.options.publicPath,
      context.compiler
    ),

    invalidate(callback) {
      // eslint-disable-next-line no-param-reassign
      callback = callback || noop;

      if (context.watching) {
        ready(context, callback, {});
        context.watching.invalidate();
      } else {
        callback();
      }
    },

    waitUntilValid(callback) {
      // eslint-disable-next-line no-param-reassign
      callback = callback || noop;

      ready(context, callback, {});
    },
  });
};
