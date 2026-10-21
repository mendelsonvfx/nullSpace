-- nullSpace: shared part of the DaVinci Resolve menu scripts (Workspace > Scripts).
-- nullSpace rewrites these files on every launch; `ctx` above holds the launch context.

local resolve = resolve or (Resolve and Resolve()) or (bmd and bmd.scriptapp and bmd.scriptapp("Resolve"))

-- The Console isn't open by default, so show a small window; print stays as the fallback
local function notify(msg)
  print("nullSpace: " .. msg)
  pcall(function()
    local f = fu or resolve:Fusion()
    local ui = f.UIManager
    local disp = bmd.UIDispatcher(ui)
    local win = disp:AddWindow({ ID = "nullSpace", WindowTitle = "nullSpace", Geometry = { 500, 400, 460, 110 } },
      ui:VGroup{ ui:Label{ Text = msg, WordWrap = true }, ui:Button{ ID = "OK", Text = "OK" } })
    function win.On.OK.Clicked() disp:ExitLoop() end
    function win.On.nullSpace.Close() disp:ExitLoop() end
    win:Show()
    disp:RunLoop()
    win:Hide()
  end)
end

local pm = resolve and resolve:GetProjectManager()

-- nullSpace projects live in their own Project Manager folder, so plain names never clash with other projects
local FOLDER = "nullSpace"
local wanted = ctx.project_names[1]

-- Resolve's Lua binding returns name lists keyed by name ({["Promo"] = 1}) rather than by index:
-- take whichever side is a string
local function names_of(list)
  local names = {}
  for k, v in pairs(list or {}) do
    if type(v) == "string" then
      names[#names + 1] = v
    elseif type(k) == "string" then
      names[#names + 1] = k
    end
  end
  return names
end

-- The working project goes by its current name or one it had before (nullSpace renames).
-- Imported versions ("<name> v003") never match
local function is_ours(name)
  if type(name) ~= "string" then return false end
  for _, n in ipairs(ctx.project_names) do
    if n == name then return true end
  end
  return false
end

-- Path of the current Project Manager folder (root excluded); leaves Project Manager at the root
local function remember_folder()
  local path = {}
  for _ = 1, 64 do
    local name = pm:GetCurrentFolder()
    if not pm:GotoParentFolder() then break end
    table.insert(path, 1, name)
  end
  return path
end

local function restore_folder(path)
  pm:GotoRootFolder()
  for _, name in ipairs(path) do
    if not pm:OpenFolder(name) then break end
  end
end

-- Open the nullSpace folder, creating it on first use
local function enter_folder()
  pm:GotoRootFolder()
  if not pm:OpenFolder(FOLDER) then
    pm:CreateFolder(FOLDER)
    pm:OpenFolder(FOLDER)
  end
end

local function run(main)
  if not pm then
    print("nullSpace: Resolve scripting object is not available")
    return
  end
  local ok, err = pcall(main)
  if not ok then notify("Error: " .. tostring(err)) end
end
