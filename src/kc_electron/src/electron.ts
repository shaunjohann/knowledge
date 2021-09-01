import {IpcResponse} from "./app/models/electron.ipc.model";
import {FileModel} from "./app/models/file.model";

const {app, BrowserWindow, BrowserView, ipcMain, dialog, shell} = require('electron');
const nativeImage = require('electron').nativeImage
const http = require('http');
const url = require('url');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const settingsService = require('./app/controller/settings.service');
const uuid = require('uuid');
const DEBUG: boolean = false;
const MAIN_ENTRY: string = path.join(app.getAppPath(), 'src', 'kc_angular', 'dist', 'main', 'index.html');

(global as any).share = {
    settingsService,
    BrowserWindow,
    BrowserView,
    nativeImage,
    ipcMain,
    dialog,
    uuid,
    http,
    shell,
    path,
    url,
    app,
    fs
};

console.log('Dirname: ', __dirname);

const browserExtensionServer = require('./app/server/server');
require('./app/ipc/ipc-index');


let appEnv = settingsService.getSettings();
let kcMainWindow: typeof BrowserWindow;

browserExtensionServer.createServer();

/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
let ingestWatcher: any;
let filesToPush: any[] = [];
let autoScanInterval: any = undefined;

/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
// Subscribes to ingest settings in order to enable/disable file watcher...
// TODO: move this elsewhere.... IPC perhaps?
settingsService.ingest.subscribe((ingest: any) => {
    if (!ingest || !ingest.autoscan || !ingest.autoscanLocation) {
        console.log('Autoscan has been disabled... closing ingestWatcher')
        if (ingestWatcher)
            ingestWatcher.close();
        clearInterval(autoScanInterval);
        return;
    }

    // If watcher already exists, close it for now so we can apply new settings
    if (ingestWatcher) {
        ingestWatcher.close();
    }
    clearInterval(autoScanInterval);
    ingestWatcher = null;

    let watchPath = path.resolve(ingest.autoscanLocation);

    let fileStat: any;
    try {
        fileStat = fs.statSync(watchPath);
    } catch (e) {
        console.warn('Could not find directory: ', watchPath, '... creating now...');
        fs.mkdirSync(watchPath, {recursive: true});
    }

    ingestWatcher = chokidar.watch(watchPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: false
    });

    ingestWatcher.on('add', (filePath: string) => {
        fileStat = fs.statSync(filePath);

        if (!fileStat) {
            console.error('Failed to read file: ', filePath);
            return;
        }

        console.log('New file found by watcher: ', filePath);

        // Create new file name based on UUID and file type extension, then copy to assigned directory
        const contentType = mime.lookup(filePath);

        // TODO: this might be set to "false", so we'll have to manually grab the extension if so...
        let fileExtension = mime.extension(contentType);
        if (!fileExtension) {
            console.warn('Could not find file extension for filePath: ', filePath);
            fileExtension = path.extname(filePath).split('.')[1];
            console.warn('Using path extname instead: ', fileExtension);
        }


        let newId = uuid.v4();
        let newFilePath = path.resolve(appEnv.appPath, 'files', newId) + `.${fileExtension}`;
        copyFileToFolder(filePath, newFilePath);

        // Prepare file model to be sent to ingest watcher service in Angular
        console.log('Preserve timestamps: ', ingest.preserveTimestamps);
        let fileModel: FileModel = {
            accessTime: ingest.preserveTimestamps ? fileStat.atime : Date(),
            creationTime: ingest.preserveTimestamps ? fileStat.ctime : Date(),
            modificationTime: ingest.preserveTimestamps ? fileStat.mtime : Date(),
            filename: path.basename(filePath),
            id: {value: newId},
            path: newFilePath,
            size: fileStat.size,
            type: contentType
        }

        // Add it to the queue
        filesToPush.push(fileModel);


        // Delete file in watched directory (since it has a new home)
        console.warn('Deleting file: ', filePath);
        fs.rmSync(filePath);
    });

    // Create a new period check for files based on user interval
    console.log('Setting interval to ', ingest.interval / 1000, ' seconds...');
    autoScanInterval = setInterval(() => {
        console.log('Checking filesToPush: ', filesToPush);
        if (filesToPush.length > 0 && ingest.autoscan) {
            let responses: any[] = [];

            for (let fileToPush of filesToPush) {
                let response: IpcResponse = {
                    error: undefined,
                    success: {
                        data: fileToPush
                    }
                }
                responses.push(response)
            }
            kcMainWindow.webContents.send('app-ingest-watcher-results', responses);
            filesToPush = [];
        }

    }, appEnv.ingest.interval);
});


/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
function copyFileToFolder(filePath: string, newFilePath: string) {
    fs.copyFileSync(filePath, newFilePath);
}


/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
function createMainWindow() {
    console.log('Startup URL entry point is: ', MAIN_ENTRY);
    let WIDTH: number = parseInt(appEnv.DEFAULT_WINDOW_WIDTH);
    let HEIGHT: number = parseInt(appEnv.DEFAULT_WINDOW_HEIGHT);
    console.log('Starting with window sizes: ', WIDTH, HEIGHT);
    const config = {
        show: false,
        width: WIDTH ? WIDTH : 1280,
        height: HEIGHT ? HEIGHT : 1000,
        title: 'Knowledge Canvas',
        webPreferences: {
            nodeIntegration: false, // is default value after Electron v5
            contextIsolation: true, // protect against prototype pollution
            enableRemoteModule: false, // turn off remote
            preload: path.join(app.getAppPath(), 'src', 'kc_electron', 'dist', 'preload.js')
        }
    };

    kcMainWindow = new BrowserWindow(config);

    // TODO: Determine if the following is the best we can do for page load failure
    // We need to explicitly reload the index upon refresh (note this is only needed in Electron)
    kcMainWindow.webContents.on('did-fail-load', () => {
        kcMainWindow.loadFile(MAIN_ENTRY);
    })

    // Destroy window on close
    kcMainWindow.on('closed', function () {
        kcMainWindow = null;
    });

    kcMainWindow.webContents.on('new-window', (event: any, url: string) => {
        console.log('New window requested: ', url);
        event.preventDefault();

        shell.openExternal(url);
    });

    kcMainWindow.loadFile(MAIN_ENTRY);
    kcMainWindow.show();

    console.log('Main window has ID: ', kcMainWindow.id);

    return kcMainWindow;
}


/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
    process.exit(0);
});


/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
app.whenReady().then(() => {
    kcMainWindow = createMainWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    })
})