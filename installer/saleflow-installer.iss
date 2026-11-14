; =====================================================================
; SaleFlow ERP - Professional Windows Inno Setup Installer Script
; Version: 1.1.0 (Commercial On-Premise Edition)
; =====================================================================

#ifndef IsTestBuild
  #define IsTestBuild "0"
#endif

#ifndef MyAppId
  #define MyAppId "{{D37F8E91-6E3A-4F7D-9A2E-1834F90F240A}"
#endif

#ifndef MyAppName
  #define MyAppName "SaleFlow ERP"
#endif

#ifndef MyAppVersion
  #define MyAppVersion "1.1.0"
#endif

#ifndef MyAppPublisher
  #define MyAppPublisher "SaleFlow Systems"
#endif

#ifndef MyAppURL
  #define MyAppURL "https://saleflow.app"
#endif

#ifndef MyAppExeName
  #define MyAppExeName "SaleFlow.exe"
#endif

#ifndef StagedPackageDir
  #define StagedPackageDir "..\dist\SaleFlow-ERP-v1.1.0-Windows-x64"
#endif

#ifndef OutputDir
  #define OutputDir "..\dist\installer"
#endif

#ifndef OutputBaseFilename
  #define OutputBaseFilename "SaleFlow-ERP-v1.1.0-Setup"
#endif

#ifndef MyGroupName
  #define MyGroupName "SaleFlow ERP"
#endif

#ifndef DefaultInstallDir
  #define DefaultInstallDir "{autopf}\SaleFlow"
#endif

#ifndef DataDirRoot
  #define DataDirRoot "{commonappdata}\SaleFlow"
#endif

#ifndef FirewallRuleName
  #define FirewallRuleName "SaleFlow ERP (Port 3000)"
#endif

#ifndef Compression
  #define Compression "lzma2/ultra64"
#endif

#ifndef SolidCompression
  #define SolidCompression "yes"
#endif

[Setup]
; Unique App ID for Windows Registry and uninstall tracking
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={#DefaultInstallDir}
DefaultGroupName={#MyGroupName}
AllowNoIcons=yes
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
Compression={#Compression}
SolidCompression={#SolidCompression}
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
DisableProgramGroupPage=auto
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
#if IsTestBuild != "1"
Name: "autostart"; Description: "Automatically launch SaleFlow ERP when Windows starts"; GroupDescription: "Windows Integration:"; Flags: unchecked
Name: "firewall"; Description: "Configure Windows Firewall rule for LAN access (Port 3000)"; GroupDescription: "Network Integration:"; Flags: unchecked
#endif

[Dirs]
; Persistent customer or test data folders (Survives uninstall by default)
Name: "{#DataDirRoot}"; Flags: uninsneveruninstall
Name: "{#DataDirRoot}\data"; Flags: uninsneveruninstall
Name: "{#DataDirRoot}\backups"; Flags: uninsneveruninstall
Name: "{#DataDirRoot}\logs"; Flags: uninsneveruninstall
Name: "{#DataDirRoot}\config"; Flags: uninsneveruninstall

[Files]
; 0. Native Windows GUI Application Launcher (Zero CMD Console Flash)
Source: "{#StagedPackageDir}\SaleFlow.exe"; DestDir: "{app}"; Flags: ignoreversion
; 1. Standalone Application Server files (NO src/, NO typescript files)
Source: "{#StagedPackageDir}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
; 2. Bundled Portable Node.js Runtime
Source: "{#StagedPackageDir}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
; 3. Windows Service and Operational Control Scripts
Source: "{#StagedPackageDir}\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion recursesubdirs createallsubdirs
; 4. Customer Guides & Documentation
Source: "{#StagedPackageDir}\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs createallsubdirs
; 5. Canonical Version Metadata
Source: "{#StagedPackageDir}\version.json"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu shortcuts (Default launch targets native GUI launcher with zero CMD flash)
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Launch {#MyAppName} (Console Debug)"; Filename: "{app}\scripts\start-saleflow.bat"; WorkingDir: "{app}"
Name: "{group}\Stop {#MyAppName}"; Filename: "{app}\scripts\stop-saleflow.bat"; WorkingDir: "{app}"
Name: "{group}\Restart {#MyAppName}"; Filename: "{app}\scripts\restart-saleflow.bat"; WorkingDir: "{app}"
Name: "{group}\Create Database Backup"; Filename: "{app}\scripts\backup-now.bat"; WorkingDir: "{app}"
Name: "{group}\Documentation"; Filename: "{app}\docs"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Optional Desktop Shortcut (Targeting native GUI launcher: Zero CMD Flash)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

; Optional Windows Auto-Start
#if IsTestBuild != "1"
Name: "{commonstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: autostart
#endif

[Run]
#if IsTestBuild != "1"
; Inbound Windows Firewall rule creation (optional task)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""{#FirewallRuleName}"" dir=in action=allow protocol=TCP localport=3000 profile=private,domain"; Flags: runhidden; Tasks: firewall
#endif

; Post-install launch option (Executes native GUI launcher: browser opens seamlessly)
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
#if IsTestBuild != "1"
; Clean up firewall rule on complete uninstall
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""{#FirewallRuleName}"""; Flags: runhidden; RunOnceId: "DelSaleFlowFirewall"
#endif

[Code]
// ===================================================================
// INSTALLATION SANITIZATION & STALE PATH REMOVAL (PRODUCTION BUILDS)
// ===================================================================
#if IsTestBuild != "1"
function InitializeSetup(): Boolean;
var
  StaleLoc: String;
  UninstallKey: String;
begin
  Result := True;
  UninstallKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' + ExpandConstant('{#MyAppId}_is1');
  
  // If HKCU has a corrupted / scratch install location for this AppId, purge it so Setup defaults cleanly
  if RegQueryStringValue(HKCU, UninstallKey, 'InstallLocation', StaleLoc) then
  begin
    if (Pos('\scratch\', LowerCase(StaleLoc)) > 0) or 
       (Pos('real_installer', LowerCase(StaleLoc)) > 0) or 
       (Pos('\test_', LowerCase(StaleLoc)) > 0) then
    begin
      RegDeleteKeyIncludingSubkeys(HKCU, UninstallKey);
    end;
  end;
end;

procedure InitializeWizard();
var
  CurDir: String;
begin
  CurDir := WizardDirValue;
  // Guard against inheriting any scratch or test path in wizard UI
  if (Pos('\scratch\', LowerCase(CurDir)) > 0) or 
     (Pos('real_installer', LowerCase(CurDir)) > 0) or 
     (Pos('\test_', LowerCase(CurDir)) > 0) then
  begin
    WizardForm.DirEdit.Text := ExpandConstant('{#DefaultInstallDir}');
  end;
end;
#endif

// ===================================================================
// UNINSTALL SAFETY: PRESERVE CUSTOMER DATA BY DEFAULT
// ===================================================================
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
#if IsTestBuild != "1"
  PromptRes: Integer;
#endif
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{#DataDirRoot}');
    if DirExists(DataDir) then
    begin
#if IsTestBuild == "1"
      // Test uninstaller: preserve data folder untouched without interactive prompt
#else
      PromptRes := MsgBox(
        'Do you want to retain your business database, backups, and license data?' + #13#10 + #13#10 +
        'Location: ' + DataDir + #13#10 + #13#10 +
        'Click [Yes] to keep your data for future reinstalls or updates (RECOMMENDED).' + #13#10 +
        'Click [No] to permanently delete all database and backup files.',
        mbConfirmation, MB_YESNO or MB_DEFBUTTON1);

      if PromptRes = IDNO then
      begin
        DelTree(DataDir, True, True, True);
      end;
#endif
    end;
  end;
end;
