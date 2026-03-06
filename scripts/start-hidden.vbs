Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\KokoG\Documents\multi-terminal"
WshShell.Run "node_modules\.bin\electron.cmd .", 0, False
