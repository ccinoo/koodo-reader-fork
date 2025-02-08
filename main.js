const {
  app,
  BrowserWindow,
  BrowserView,
  Menu,
  ipcMain,
  dialog,
  powerSaveBlocker,
  nativeTheme,
  safeStorage,
  protocol
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const Store = require("electron-store");
const store = new Store();
const fs = require("fs");
const configDir = app.getPath("userData");
const dirPath = path.join(configDir, "uploads");
let mainWin;
let readerWindow;
let urlWindow;
let mainView;
let dbConnection = {};
let syncUtilCache = {};
const singleInstance = app.requestSingleInstanceLock();
var filePath = null;
if (process.platform != "darwin" && process.argv.length >= 2) {
  filePath = process.argv[1];
}
let options = {
  width: 1050,
  height: 660,
  backgroundColor: '#fff',
  webPreferences: {
    webSecurity: false,
    nodeIntegration: true,
    contextIsolation: false,
    nativeWindowOpen: true,
    nodeIntegrationInSubFrames: false,
    allowRunningInsecureContent: false,
    enableRemoteModule: true,
  },
};
const os = require('os');
const Database = require("better-sqlite3");
if (os.platform() === 'linux') {
  options = Object.assign({}, options, {
    icon: path.join(__dirname, "./build/assets/icon.png"),
  });
}
// Single Instance Lock
if (!singleInstance) {
  app.quit();
  if (filePath) {
    fs.writeFileSync(
      path.join(dirPath, "log.json"),
      JSON.stringify({ filePath }),
      "utf-8"
    );
  }
} else {
  app.on("second-instance", (event, argv, workingDir) => {
    if (mainWin) {
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
    }
  });
}
const getDBConnection = (dbName, storagePath, sqlStatement) => {
  if (!dbConnection[dbName]) {
    if (!fs.existsSync(path.join(storagePath, "config"))) {
      fs.mkdirSync(path.join(storagePath, "config"), { recursive: true });
    }
    dbConnection[dbName] = new Database(path.join(storagePath, "config", `${dbName}.db`), { verbose: console.log });
    dbConnection[dbName].pragma('journal_mode = WAL');
    dbConnection[dbName].exec(sqlStatement["createTableStatement"][dbName]);
  }
  return dbConnection[dbName];
}
const getSyncUtil = async (config) => {
  if (!syncUtilCache[config.service]) {
    const { SyncUtil, TokenService, ThirdpartyRequest } = await import('./src/assets/lib/kookit-extra.min.mjs');
    let thirdpartyRequest = new ThirdpartyRequest(TokenService);

    syncUtilCache[config.service] = new SyncUtil(config.service, config, config.storagePath, thirdpartyRequest);
  }
  return syncUtilCache[config.service];
}
const removeSyncUtil = (config) => {
  if (syncUtilCache[config.service]) {
    syncUtilCache[config.service] = null;
  }
}
const createMainWin = () => {
  mainWin = new BrowserWindow(options);

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }
  const urlLocation = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "./build/index.html")}`;
  mainWin.loadURL(urlLocation);

  mainWin.on("close", () => {
    mainWin = null;
  });
  mainWin.on("resize", () => {
    if (mainView) {
      let [width, height] = mainWin.getSize()
      mainView.setBounds({ x: 0, y: 0, width: width, height: height })
    }
  });
  mainWin.on("maximize", () => {
    if (mainView) {
      let [width, height] = mainWin.getSize()
      mainView.setBounds({ x: 0, y: 0, width: width, height: height })
    }
  });
  mainWin.on("unmaximize", () => {
    if (mainView) {
      let [width, height] = mainWin.getSize()
      mainView.setBounds({ x: 0, y: 0, width: width, height: height })
    }
  });

  ipcMain.handle("open-book", (event, config) => {
    let { url, isMergeWord, isAutoFullscreen, isPreventSleep } = config;
    options.webPreferences.nodeIntegrationInSubFrames = true;
    if (isMergeWord) {
      delete options.backgroundColor
    }
    store.set({
      url,
      isMergeWord: isMergeWord || "no",
      isAutoFullscreen: isAutoFullscreen || "no",
      isPreventSleep: isPreventSleep || "no",
    });
    let id;
    if (isPreventSleep === "yes") {
      id = powerSaveBlocker.start("prevent-display-sleep");
      console.log(powerSaveBlocker.isStarted(id));
    }

    if (isAutoFullscreen === "yes") {
      readerWindow = new BrowserWindow(options);
      readerWindow.loadURL(url);
      readerWindow.maximize();
    } else {
      readerWindow = new BrowserWindow({
        ...options,
        width: parseInt(store.get("windowWidth") || 1050),
        height: parseInt(store.get("windowHeight") || 660),
        x: parseInt(store.get("windowX")),
        y: parseInt(store.get("windowY")),
        frame: isMergeWord === "yes" ? false : true,
        hasShadow: isMergeWord === "yes" ? false : true,
        transparent: isMergeWord === "yes" ? true : false,
      });
      readerWindow.loadURL(url);
      // readerWindow.webContents.openDevTools();
    }
    readerWindow.on("close", (event) => {
      if (!readerWindow.isDestroyed()) {
        let bounds = readerWindow.getBounds();
        if (bounds.width > 0 && bounds.height > 0) {
          store.set({
            windowWidth: bounds.width,
            windowHeight: bounds.height,
            windowX: bounds.x,
            windowY: bounds.y,
          });
        }
      }
      if (isPreventSleep && !readerWindow.isDestroyed()) {
        id && powerSaveBlocker.stop(id);
      }
      // readerWindow && readerWindow.destroy();
      // readerWindow = null;
    });


    event.returnValue = "success";
  });
  ipcMain.handle("generate-tts", async (event, voiceConfig) => {
    let { text, speed, plugin, config } = voiceConfig;
    let voiceFunc = plugin.script
    // eslint-disable-next-line no-eval
    eval(voiceFunc);
    return global.getAudioPath(text, speed, dirPath, config);

  });
  ipcMain.handle("cloud-upload", async (event, config) => {
    console.log(config);
    let syncUtil = await getSyncUtil(config);
    let result = await syncUtil.uploadFile(config.fileName, config.fileName, config.type);
    return result;
  });

  ipcMain.handle("cloud-download", async (event, config) => {
    let syncUtil = await getSyncUtil(config);
    let result = await syncUtil.downloadFile(config.fileName, (config.isTemp ? "temp-" : "") + config.fileName, config.type);
    return result;
  });

  ipcMain.handle("cloud-delete", async (event, config) => {
    let syncUtil = await getSyncUtil(config);
    let result = await syncUtil.deleteFile(config.fileName, config.type);
    return result;
  });

  ipcMain.handle("cloud-list", async (event, config) => {
    let syncUtil = await getSyncUtil(config);
    let result = await syncUtil.listFiles(config.type);
    return result;
  });
  ipcMain.handle("cloud-close", async (event, config) => {
    removeSyncUtil(config);
    return "pong";
  });


  ipcMain.handle("clear-tts", async (event, config) => {
    if (!fs.existsSync(path.join(dirPath, "tts"))) {
      return "pong";
    } else {
      const fsExtra = require("fs-extra");
      try {
        await fsExtra.remove(path.join(dirPath, "tts"));
        await fsExtra.mkdir(path.join(dirPath, "tts"));
        return "pong";
      } catch (err) {
        console.error(err);
        return "pong";
      }
    }
  });
  ipcMain.handle("select-path", async (event) => {
    var path = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return path.filePaths[0];
  });
  ipcMain.handle("encrypt-data", async (event, config) => {
    let encrypted = safeStorage.encryptString(config.token).toString("base64");
    store.set("encryptedToken", encrypted);
    return "pong";
  });
  ipcMain.handle("decrypt-data", async (event) => {
    let encrypted = store.get("encryptedToken");
    if (!encrypted) return "";
    let decrypted = safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    return decrypted;
  });
  ipcMain.handle("get-mac", async (event, config) => {
    const { machineIdSync } = require('node-machine-id');
    return machineIdSync();
  });
  ipcMain.handle("get-store-value", async (event, config) => {
    return store.get(config.key);
  });

  ipcMain.handle("reset-reader-position", async (event) => {
    store.delete("windowX");
    store.delete("windowY");
    return "success"

  });

  ipcMain.handle("select-file", async (event, config) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Zip Files', extensions: ['zip'] }]
    });

    if (result.canceled) {
      console.log('User canceled the file selection');
      return "";
    } else {
      const filePath = result.filePaths[0];
      console.log('Selected file path:', filePath);
      return filePath;
    }
  });

  ipcMain.handle("select-book", async (event, config) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{
        name: 'Books', extensions: ["epub", "pdf", "txt", "mobi", "azw3", "azw", "htm", "html", "xml", "xhtml", "mhtml", "docx", "md", "fb2", "cbz", "cbt", "cbr", "cb7",]
      }]
    });

    if (result.canceled) {
      console.log('User canceled the file selection');
      return [];
    } else {
      const filePaths = result.filePaths;
      console.log('Selected file path:', filePaths);
      return filePaths;
    }
  });
  ipcMain.handle("database-command", async (event, config) => {
    const { SqlStatement } = await import('./src/assets/lib/kookit-extra.min.mjs');
    let { statement, statementType, executeType, dbName, data, storagePath } = config;
    let db = getDBConnection(dbName, storagePath, SqlStatement.sqlStatement);
    let sql = ""
    if (statementType === "string") {
      sql = SqlStatement.sqlStatement[statement][dbName];
    } else if (statementType === "function") {
      sql = SqlStatement.sqlStatement[statement][dbName](data);
    }
    const row = db.prepare(sql);
    let result;
    if (data) {
      if (statement.startsWith("save") || statement.startsWith("update")) {
        data = SqlStatement.jsonToSqlite[dbName](data)
      }
      result = row[executeType](data);
    } else {
      result = row[executeType]();
    }
    if (executeType === 'all') {
      return result.map(item => SqlStatement.sqliteToJson[dbName](item));
    } else if (executeType === 'get') {
      return SqlStatement.sqliteToJson[dbName](result);
    } else {
      return result;
    }

  });
  ipcMain.handle("close-database", async (event, config) => {
    const { SqlStatement } = await import('./src/assets/lib/kookit-extra.min.mjs');
    let { dbName, storagePath } = config;
    let db = getDBConnection(dbName, storagePath, SqlStatement.sqlStatement);
    delete dbConnection[dbName];
    db.close();
  });

  ipcMain.on("user-data", (event, arg) => {
    event.returnValue = dirPath;
  });
  ipcMain.handle("hide-reader", (event, arg) => {
    if (!readerWindow.isDestroyed() && readerWindow && readerWindow.isFocused()) {
      readerWindow.minimize();
      event.returnvalue = true;
    } else if (mainWin && mainWin.isFocused()) {
      mainWin.minimize();
      event.returnvalue = true;
    } else {
      event.returnvalue = false;
    }
  });
  ipcMain.handle("open-console", (event, arg) => {
    mainWin.webContents.openDevTools();
    event.returnvalue = true;
  });
  ipcMain.handle("reload-reader", (event, arg) => {
    if (readerWindow) {
      readerWindow.reload();
    }
  });
  ipcMain.handle("reload-main", (event, arg) => {
    if (mainWin) {
      mainWin.reload();
    }
  });
  ipcMain.handle("focus-on-main", (event, arg) => {
    if (mainWin) {
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
    }
  });
  ipcMain.handle("create-new-main", (event, arg) => {
    if (!mainWin) {
      createMainWin();
    }
  });
  ipcMain.handle("new-tab", (event, config) => {
    if (mainWin) {
      mainView = new BrowserView(options)
      mainWin.setBrowserView(mainView)
      let [width, height] = mainWin.getSize()
      mainView.setBounds({ x: 0, y: 0, width: width, height: height })
      mainView.webContents.loadURL(config.url)
    }
  });

  ipcMain.handle("reload-tab", (event, config) => {
    if (mainWin && mainView) {
      mainView.webContents.reload()
    }
  });
  ipcMain.handle("adjust-tab-size", (event, config) => {
    if (mainWin && mainView) {
      let [width, height] = mainWin.getSize()
      mainView.setBounds({ x: 0, y: 0, width: width, height: height })
    }
  });
  ipcMain.handle("exit-tab", (event, message) => {
    if (mainWin && mainView) {
      mainWin.setBrowserView(null)
    }
  });
  ipcMain.handle("enter-tab-fullscreen", () => {
    if (mainWin && mainView) {
      mainWin.setFullScreen(true);
      console.log("enter full");
    }
  });
  ipcMain.handle("exit-tab-fullscreen", () => {
    if (mainWin && mainView) {
      mainWin.setFullScreen(false);
      console.log("exit full");
    }
  });
  ipcMain.handle("enter-fullscreen", () => {
    if (readerWindow) {
      readerWindow.setFullScreen(true);
      console.log("enter full");
    }
  });
  ipcMain.handle("exit-fullscreen", () => {
    if (readerWindow) {
      readerWindow.setFullScreen(false);
      console.log("exit full");
    }
  });
  ipcMain.handle("open-url", (event, config) => {
    if (!urlWindow || urlWindow.isDestroyed()) {
      urlWindow = new BrowserWindow(options);
    }
    urlWindow.loadURL(config.url);
  });
  ipcMain.handle("switch-moyu", (event, arg) => {
    let id;
    if (store.get("isPreventSleep") === "yes") {
      id = powerSaveBlocker.start("prevent-display-sleep");
      console.log(powerSaveBlocker.isStarted(id));
    }
    if (readerWindow) {
      readerWindow.close();
      if (store.get("isMergeWord") === "yes") {
        delete options.backgroundColor
      }
      Object.assign(options, {
        width: parseInt(store.get("windowWidth") || 1050),
        height: parseInt(store.get("windowHeight") || 660),
        x: parseInt(store.get("windowX")),
        y: parseInt(store.get("windowY")),
        frame: store.get("isMergeWord") !== "yes" ? false : true,
        hasShadow: store.get("isMergeWord") !== "yes" ? false : true,
        transparent: store.get("isMergeWord") !== "yes" ? true : false,
      });
      options.webPreferences.nodeIntegrationInSubFrames = true;

      store.set(
        "isMergeWord",
        store.get("isMergeWord") !== "yes" ? "yes" : "no"
      );
      readerWindow = new BrowserWindow(options);
      readerWindow.loadURL(store.get("url"));
      readerWindow.on("close", (event) => {
        if (!readerWindow.isDestroyed()) {
          let bounds = readerWindow.getBounds();
          if (bounds.width > 0 && bounds.height > 0) {
            store.set({
              windowWidth: bounds.width,
              windowHeight: bounds.height,
              windowX: bounds.x,
              windowY: bounds.y,
            });
          }
        }
        if (store.get("isPreventSleep") && !readerWindow.isDestroyed()) {
          id && powerSaveBlocker.stop(id);
        }
        // readerWindow && readerWindow.destroy();
        // readerWindow = null;
      });
    }
    event.returnvalue = false;
  });
  ipcMain.on("storage-location", (event, config) => {
    event.returnValue = path.join(dirPath, "data");
  });
  ipcMain.on("get-dirname", (event, arg) => {
    event.returnValue = __dirname;
  });
  ipcMain.on("system-color", (event, arg) => {
    event.returnValue = nativeTheme.shouldUseDarkColors || false;
  });
  ipcMain.on("check-main-open", (event, arg) => {
    event.returnValue = mainWin ? true : false;
  });
  ipcMain.on("get-file-data", function (event) {
    if (fs.existsSync(path.join(dirPath, "log.json"))) {
      const _data = JSON.parse(
        fs.readFileSync(path.join(dirPath, "log.json"), "utf-8") || "{}"
      );
      if (_data && _data.filePath) {
        filePath = _data.filePath;
        fs.writeFileSync(path.join(dirPath, "log.json"), "", "utf-8");
      }
    }

    event.returnValue = filePath;
    filePath = null;
  });
};
app.on("ready", () => {
  createMainWin();
});
app.on("window-all-closed", () => {
  app.quit();
});
app.on("open-file", (e, pathToFile) => {
  filePath = pathToFile;
});
// Register protocol handler
app.setAsDefaultProtocolClient('koodo-reader');
// Handle deep linking
app.on('second-instance', (event, commandLine) => {
  const url = commandLine.pop();
  if (url) {
    handleCallback(url);
  }
});

// Handle MacOS deep linking
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleCallback(url);
});

const handleCallback = (url) => {
  const code = new URL(url).searchParams.get('code');
  const state = new URL(url).searchParams.get('state');
  if (code && mainWin) {
    mainWin.webContents.send('oauth-callback', { code, state });
  }
};