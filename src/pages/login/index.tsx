import { connect } from "react-redux";
import "./login.css";
import { stateType } from "../../store";
import {
  handleLoadingDialog,
  handleFetchAuthed,
  handleSetting,
  handleSettingMode,
  handleSettingDrive,
  handleFetchDataSourceList,
  handleFetchDefaultSyncOption,
} from "../../store/actions";
import Login from "./component";
import { withTranslation } from "react-i18next";
import { withRouter } from "react-router-dom";
const mapStateToProps = (state: stateType) => {
  return {
    isSettingOpen: state.manager.isSettingOpen,
    isShowLoading: state.manager.isShowLoading,
  };
};
const actionCreator = {
  handleLoadingDialog,
  handleFetchAuthed,
  handleSetting,
  handleSettingMode,
  handleSettingDrive,
  handleFetchDataSourceList,
  handleFetchDefaultSyncOption,
};
export default connect(
  mapStateToProps,
  actionCreator
)(withTranslation()(withRouter(Login as any) as any) as any);
