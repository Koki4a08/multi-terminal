Set WshShell = CreateObject("WScript.Shell")

' Create hidden launcher VBS
Set fso = CreateObject("Scripting.FileSystemObject")
launcherPath = "c:\Users\KokoG\Documents\multi-terminal\start-hidden.vbs"
Set f = fso.CreateTextFile(launcherPath, True)
f.WriteLine "Set WshShell = CreateObject(""WScript.Shell"")"
f.WriteLine "WshShell.CurrentDirectory = ""c:\Users\KokoG\Documents\multi-terminal"""
f.WriteLine "WshShell.Run ""node_modules\.bin\electron.cmd ."", 0, False"
f.Close

' Create desktop shortcut
desktopPath = WshShell.SpecialFolders("Desktop")
Set Shortcut = WshShell.CreateShortcut(desktopPath & "\Multi Terminal.lnk")
Shortcut.TargetPath = "wscript.exe"
Shortcut.Arguments = """c:\Users\KokoG\Documents\multi-terminal\start-hidden.vbs"""
Shortcut.WorkingDirectory = "c:\Users\KokoG\Documents\multi-terminal"
Shortcut.Description = "Multi Terminal"
Shortcut.Save

WScript.Echo "Desktop shortcut created! The app auto-requests admin when launched."
