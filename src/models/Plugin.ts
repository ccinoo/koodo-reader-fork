class Plugin {
  identifier: string;
  type: string;
  displayName: string;
  icon: string;
  version: string;
  config: object;
  langList: object | any[];
  script: string;
  constructor(
    identifier: string,
    type: string,
    displayName: string,
    icon: string,
    version: string,
    config: object,
    langList: any,
    script: string
  ) {
    this.identifier = identifier;
    this.type = type;
    this.displayName = displayName;
    this.icon = icon;
    this.version = version;
    this.config = config;
    this.langList = langList;
    this.script = script;
  }
}

export default Plugin;
