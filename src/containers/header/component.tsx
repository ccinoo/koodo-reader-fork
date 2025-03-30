import React from "react";
import "./header.css";
import SearchBox from "../../components/searchBox";
import ImportLocal from "../../components/importLocal";
import { HeaderProps, HeaderState } from "./interface";
import {
  ConfigService,
  TokenService,
} from "../../assets/lib/kookit-extra-browser.min";
import UpdateInfo from "../../components/dialogs/updateDialog";
import { restoreFromConfigJson } from "../../utils/file/restore";
import { backupToConfigJson } from "../../utils/file/backup";
import { isElectron } from "react-device-detect";
import {
  getCloudConfig,
  getLastSyncTimeFromConfigJson,
  upgradeConfig,
  upgradePro,
  upgradeStorage,
} from "../../utils/file/common";
import toast from "react-hot-toast";
import { Trans } from "react-i18next";
import { SyncHelper } from "../../assets/lib/kookit-extra-browser.min";
import ConfigUtil from "../../utils/file/configUtil";
import DatabaseService from "../../utils/storage/databaseService";
import CoverUtil from "../../utils/file/coverUtil";
import BookUtil from "../../utils/file/bookUtil";
import {
  addChatBox,
  getChatLocale,
  getStorageLocation,
  removeChatBox,
} from "../../utils/common";
import { driveList } from "../../constants/driveList";
import SupportDialog from "../../components/dialogs/supportDialog";
import SyncService from "../../utils/storage/syncService";

class Header extends React.Component<HeaderProps, HeaderState> {
  timer: any;
  constructor(props: HeaderProps) {
    super(props);

    this.state = {
      isOnlyLocal: false,
      language: ConfigService.getReaderConfig("lang"),
      isNewVersion: false,
      width: document.body.clientWidth,
      isDataChange: false,
      isDeveloperVer: false,
      isHidePro: false,
      isSync: false,
    };
  }
  async componentDidMount() {
    this.props.handleFetchAuthed();
    this.props.handleFetchDefaultSyncOption();
    this.props.handleFetchDataSourceList();

    if (isElectron) {
      const fs = window.require("fs");
      const path = window.require("path");
      const { ipcRenderer } = window.require("electron");
      const dirPath = ipcRenderer.sendSync("user-data", "ping");
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(path.join(dirPath, "data", "book"), { recursive: true });
        console.info("folder created");
      } else {
        console.info("folder exist");
      }

      if (
        ConfigService.getReaderConfig("storageLocation") &&
        !ConfigService.getItem("storageLocation")
      ) {
        ConfigService.setItem(
          "storageLocation",
          ConfigService.getReaderConfig("storageLocation")
        );
      }

      if (ConfigService.getReaderConfig("appInfo") === "dev") {
        this.setState({ isDeveloperVer: true });
      }
      if (ConfigService.getReaderConfig("isHidePro") === "yes") {
        this.setState({ isHidePro: true });
      }

      //Check for data update
      //upgrade data from old version
      let res1 = await upgradeStorage(this.handleFinishUpgrade);
      let res2 = upgradeConfig();
      if (!res1 || !res2) {
        console.error("upgrade failed");
      }

      //Detect data modification
      let lastSyncTime = getLastSyncTimeFromConfigJson();
      if (
        ConfigService.getItem("lastSyncTime") &&
        lastSyncTime > parseInt(ConfigService.getItem("lastSyncTime") || "0")
      ) {
        this.setState({ isDataChange: true });
      }
    } else {
      upgradeConfig();
    }
    window.addEventListener("resize", () => {
      this.setState({ width: document.body.clientWidth });
    });
    window.addEventListener("focus", () => {
      this.props.handleFetchBooks();
      this.props.handleFetchNotes();
      this.props.handleFetchBookmarks();
    });
  }
  async UNSAFE_componentWillReceiveProps(
    nextProps: Readonly<HeaderProps>,
    _nextContext: any
  ) {
    if (nextProps.isAuthed && nextProps.isAuthed !== this.props.isAuthed) {
      if (isElectron) {
        window.require("electron").ipcRenderer.invoke("new-chat", {
          url: "https://dl.koodoreader.com/chat.html",
          locale: getChatLocale(),
        });
      } else {
        addChatBox();
      }
      if (
        this.props.books &&
        ConfigService.getReaderConfig("isProUpgraded") !== "yes"
      ) {
        try {
          await upgradePro(this.props.books);
        } catch (error) {
          console.error(error);
        }

        ConfigService.setReaderConfig("isProUpgraded", "yes");
      }
    }
    if (!nextProps.isAuthed && nextProps.isAuthed !== this.props.isAuthed) {
      if (isElectron) {
        window.require("electron").ipcRenderer.invoke("exit-chat", {
          url: "https://dl.koodoreader.com/chat.html",
          locale: getChatLocale(),
        });
      } else {
        removeChatBox();
      }
    }
  }
  handleFinishUpgrade = () => {
    setTimeout(() => {
      this.props.history.push("/manager/home");
    }, 1000);
  };

  syncFromLocation = async () => {
    let result = await restoreFromConfigJson();
    if (result) {
      this.setState({ isDataChange: false });
      //Check for data update
      let lastSyncTime = getLastSyncTimeFromConfigJson();
      if (ConfigService.getItem("lastSyncTime") && lastSyncTime) {
        ConfigService.setItem("lastSyncTime", lastSyncTime + "");
      } else {
        let timestamp = new Date().getTime().toString();
        ConfigService.setItem("lastSyncTime", timestamp);
      }
    }
    if (!result) {
      toast.error(this.props.t("Sync failed"));
    } else {
      toast.success(
        this.props.t("Synchronisation successful") +
          " (" +
          this.props.t("Local") +
          ")"
      );
      toast.success(
        this.props.t(
          "Your data has been imported from your local folder, Upgrade to pro to get more advanced features"
        ),
        {
          duration: 4000,
        }
      );
    }
  };
  handleLocalSync = async () => {
    let lastSyncTime = getLastSyncTimeFromConfigJson();
    if (!lastSyncTime && ConfigService.getItem("lastSyncTime")) {
      await this.syncToLocation();
    } else {
      if (
        ConfigService.getItem("lastSyncTime") &&
        lastSyncTime < parseInt(ConfigService.getItem("lastSyncTime")!)
      ) {
        await this.syncToLocation();
      } else {
        await this.syncFromLocation();
      }
    }

    this.setState({ isSync: false });
  };
  beforeSync = async () => {
    if (!this.props.defaultSyncOption) {
      toast.error(this.props.t("Please add data source in the setting"));
      this.setState({ isSync: false });
      return false;
    }
    let config = await getCloudConfig(this.props.defaultSyncOption);
    if (Object.keys(config).length === 0) {
      toast.error(this.props.t("Cannot get sync config"));
      this.setState({ isSync: false });
      return false;
    }
    toast.loading(
      this.props.t("Start syncing") +
        " (" +
        this.props.t(
          driveList.find((item) => item.value === this.props.defaultSyncOption)
            ?.label || ""
        ) +
        ")",
      { id: "syncing" }
    );
    return true;
  };
  getCompareResult = async () => {
    let localSyncRecords = ConfigService.getAllSyncRecord();
    let cloudSyncRecords = await ConfigUtil.getCloudConfig("sync");
    return await SyncHelper.compareAll(
      localSyncRecords,
      cloudSyncRecords,
      ConfigService,
      TokenService,
      ConfigUtil
    );
  };
  handleCloudSync = async () => {
    let config = {};
    let service = ConfigService.getItem("defaultSyncOption");
    if (!service) {
      toast.error(this.props.t("Please add data source in the setting"));
      this.setState({ isSync: false });
      return false;
    }
    if (isElectron) {
      let tokenConfig = await getCloudConfig(service);
      config = {
        ...tokenConfig,
        service: service,
        storagePath: getStorageLocation(),
      };
      await window
        .require("electron")
        .ipcRenderer.invoke("cloud-reset", config);
    } else {
      let syncUtil = await SyncService.getSyncUtil();
      syncUtil.resetCounters();
    }
    this.timer = setInterval(async () => {
      if (isElectron) {
        let stats = await window
          .require("electron")
          .ipcRenderer.invoke("cloud-stats", config);
        toast.loading(
          this.props.t("Start Transfering Data") +
            " (" +
            stats.completed +
            "/" +
            stats.total +
            ")",
          {
            id: "syncing",
          }
        );
      } else {
        let syncUtil = await SyncService.getSyncUtil();
        let stats = await syncUtil.getStats();
        toast.loading(
          this.props.t("Start Transfering Data") +
            " (" +
            stats.completed +
            "/" +
            stats.total +
            ")",
          {
            id: "syncing",
          }
        );
      }
    }, 1000);
    let res = await this.beforeSync();
    if (!res) {
      return;
    }
    let compareResult = await this.getCompareResult();

    await this.handleSync(compareResult);
    this.setState({ isSync: false });
  };
  handleSuccess = async () => {
    this.props.handleFetchBooks();
    this.props.handleFetchBookmarks();
    this.props.handleFetchNotes();
    toast.success(this.props.t("Synchronisation successful"), {
      id: "syncing",
    });
    if (this.props.defaultSyncOption === "adrive") {
      toast.success(
        this.props.t(
          "Due to Aliyun Drive's stringent concurrency restrictions, we have bypassed the synchronization of books and covers. Please manually download the books by clicking on them"
        ),
        {
          duration: 4000,
        }
      );
    }
    setTimeout(() => {
      this.props.history.push("/manager/home");
    }, 1000);
  };
  handleSync = async (compareResult) => {
    try {
      let tasks = await SyncHelper.startSync(
        compareResult,
        ConfigService,
        DatabaseService,
        ConfigUtil,
        BookUtil,
        CoverUtil
      );
      await SyncHelper.runTasksWithLimit(
        tasks,
        99,
        ConfigService.getItem("defaultSyncOption")
      );
      clearInterval(this.timer);
      toast.loading(this.props.t("Almost finished"), {
        id: "syncing",
      });
      await this.handleSuccess();
    } catch (error) {
      console.error(error);
      toast.error(this.props.t("Sync failed"), {
        id: "syncing",
      });
      return;
    }
  };
  syncToLocation = async () => {
    let timestamp = new Date().getTime().toString();
    ConfigService.setItem("lastSyncTime", timestamp);
    backupToConfigJson();
    toast.success(
      this.props.t("Synchronisation successful") +
        " (" +
        this.props.t("Local") +
        ")"
    );
    toast.success(
      this.props.t(
        "Your data has been exported to your local folder, learn how to sync your data to your other devices by visiting our documentation, Upgrade to pro to get more advanced features"
      ),
      {
        duration: 4000,
      }
    );
  };

  render() {
    return (
      <div
        className="header"
        style={this.props.isCollapsed ? { marginLeft: "40px" } : {}}
      >
        <div
          className="header-search-container"
          style={this.props.isCollapsed ? { width: "369px" } : {}}
        >
          <SearchBox />
        </div>
        <div
          className="setting-icon-parrent"
          style={this.props.isCollapsed ? { marginLeft: "430px" } : {}}
        >
          <div
            className="setting-icon-container"
            onClick={() => {
              this.props.handleSortDisplay(!this.props.isSortDisplay);
            }}
            onMouseLeave={() => {
              this.props.handleSortDisplay(false);
            }}
            style={{ top: "18px" }}
          >
            <span
              data-tooltip-id="my-tooltip"
              data-tooltip-content={this.props.t("Sort by")}
              data-tooltip-place="left"
            >
              <span className="icon-sort-desc header-sort-icon"></span>
            </span>
          </div>
          <div
            className="setting-icon-container"
            onClick={() => {
              this.props.handleAbout(!this.props.isAboutOpen);
            }}
            onMouseLeave={() => {
              this.props.handleAbout(false);
            }}
            style={{ marginTop: "2px" }}
          >
            <span
              data-tooltip-id="my-tooltip"
              data-tooltip-content={this.props.t("Setting")}
              data-tooltip-place="left"
            >
              <span
                className="icon-setting setting-icon"
                style={
                  this.props.isNewWarning ? { color: "rgb(35, 170, 242)" } : {}
                }
              ></span>
            </span>
          </div>
          <div
            className="setting-icon-container"
            onClick={() => {
              this.props.handleBackupDialog(true);
            }}
            onMouseLeave={() => {
              this.props.handleSortDisplay(false);
            }}
            style={{ marginTop: "1px" }}
          >
            <span
              data-tooltip-id="my-tooltip"
              data-tooltip-content={this.props.t("Backup")}
              data-tooltip-place="left"
            >
              <span className="icon-archive header-archive-icon"></span>
            </span>
          </div>

          <div
            className="setting-icon-container"
            onClick={async () => {
              this.setState({ isSync: true });
              if (!isElectron && !this.props.isAuthed) {
                toast(
                  this.props.t(
                    "This feature is not available in the free version"
                  )
                );
              }
              if (this.props.isAuthed) {
                this.handleCloudSync();
              } else {
                this.handleLocalSync();
              }
            }}
            style={{ marginTop: "2px" }}
          >
            <span
              data-tooltip-id="my-tooltip"
              data-tooltip-content={this.props.t("Sync")}
              data-tooltip-place="left"
            >
              <span
                className={
                  "icon-sync setting-icon" +
                  (this.state.isSync ? " icon-rotate" : "")
                }
                style={
                  this.state.isDataChange ? { color: "rgb(35, 170, 242)" } : {}
                }
              ></span>
            </span>
          </div>
        </div>

        {!this.props.isAuthed && !this.state.isHidePro ? (
          <div className="header-report-container">
            <span
              style={{ textDecoration: "underline" }}
              onClick={() => {
                this.props.history.push("/login");
              }}
            >
              <Trans>Pro version</Trans>
              <span> </span>
            </span>
            {this.state.isDeveloperVer && (
              <span
                className="icon-close icon-pro-close"
                onClick={() => {
                  ConfigService.setReaderConfig("isHidePro", "yes");
                  this.setState({ isHidePro: true });
                }}
              ></span>
            )}
          </div>
        ) : null}
        {this.state.isDeveloperVer &&
          this.state.isHidePro &&
          !this.props.isAuthed && (
            <div
              className="header-report-container"
              style={{ textDecoration: "underline" }}
              onClick={() => {
                this.props.handleFeedbackDialog(true);
              }}
            >
              <Trans>Report</Trans>
            </div>
          )}

        <ImportLocal
          {...{
            handleDrag: this.props.handleDrag,
          }}
        />
        <UpdateInfo />
        <SupportDialog />
      </div>
    );
  }
}

export default Header;
