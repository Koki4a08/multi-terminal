Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\KokoG\Documents\multi-terminal"
WshShell.Run """scripts\create-shortcut.vbs""", 1, False
