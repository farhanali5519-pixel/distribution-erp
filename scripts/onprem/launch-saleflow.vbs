' =====================================================================
' SaleFlow ERP - Silent Windows Launcher Script (Fallback)
' Launches SaleFlow ERP without showing any command prompt window.
' =====================================================================

Option Explicit

Dim WshShell, fso, scriptDir, baseDir, runtimeNode, controllerJs, nodeExe, cmd, exitCode

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
baseDir = fso.GetParentFolderName(scriptDir)
runtimeNode = fso.BuildPath(baseDir, "runtime\node.exe")
controllerJs = fso.BuildPath(scriptDir, "process-controller.js")

If fso.FileExists(runtimeNode) Then
    nodeExe = runtimeNode
Else
    nodeExe = "node.exe"
End If

cmd = """" & nodeExe & """ """ & controllerJs & """ launch"
' Run with WindowStyle 0 (Hidden) and bWaitOnReturn True
exitCode = WshShell.Run(cmd, 0, True)

WScript.Quit exitCode
