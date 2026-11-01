; "Open in Kex" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInKex" "" "Open in Kex"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInKex" "Icon" '"$INSTDIR\kex.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInKex" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInKex\command" "" '"$INSTDIR\kex.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInKex" "" "Open in Kex"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInKex" "Icon" '"$INSTDIR\kex.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInKex" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInKex\command" "" '"$INSTDIR\kex.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInKex" "" "Open in Kex"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInKex" "Icon" '"$INSTDIR\kex.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInKex" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInKex\command" "" '"$INSTDIR\kex.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInKex"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInKex"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInKex"
!macroend
