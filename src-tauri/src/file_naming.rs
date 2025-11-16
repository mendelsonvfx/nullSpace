use regex::Regex;

/// Constants for file naming format
pub const SHOT_DIGITS: usize = 3;
pub const VERSION_DIGITS: usize = 3;

/// Components of a project file name
/// Format: PROJECT_SCENE_SHOT_v001.ext or PROJECT_SCENE_SHOT_CONTEXT_v001.ext
#[derive(Debug, Clone)]
pub struct FileNameComponents {
    pub project_name: String,
    pub scene_name: String,
    pub shot_number: u32,
    pub special_context: Option<String>,
    pub version: u32,
    pub extension: String,
}

impl FileNameComponents {
    /// Create new file name components
    pub fn new(
        project_name: String,
        scene_name: String,
        shot_number: u32,
        special_context: Option<String>,
        version: u32,
        extension: String,
    ) -> Self {
        Self {
            project_name: project_name.replace(" ", "").to_uppercase(),
            scene_name: scene_name.replace(" ", "").to_uppercase(),
            shot_number,
            special_context: special_context.map(|c| c.replace(" ", "").to_uppercase()),
            version,
            extension,
        }
    }

    /// Build full file name: PROJECT_SCENE_SHOT_v001.ext
    /// Or with context: PROJECT_SCENE_SHOT_CONTEXT_v001.ext
    pub fn build(&self) -> String {
        let base = self.get_base_name();
        let version_str = format!("v{:0width$}", self.version, width = VERSION_DIGITS);

        if self.extension.is_empty() {
            format!("{}_{}", base, version_str)
        } else {
            let ext = if self.extension.starts_with('.') {
                &self.extension[1..]
            } else {
                &self.extension
            };
            format!("{}_{}.{}", base, version_str, ext)
        }
    }

    /// Get base name without version: PROJECT_SCENE_SHSHOT or PROJECT_SCENE_SHSHOT_CONTEXT
    pub fn get_base_name(&self) -> String {
        let shot_str = format!("SH{:0width$}", self.shot_number, width = SHOT_DIGITS);

        if let Some(ref context) = self.special_context {
            format!(
                "{}_{}_{}_{}",
                self.project_name,
                self.scene_name,
                shot_str,
                context
            )
        } else {
            format!("{}_{}_{}", self.project_name, self.scene_name, shot_str)
        }
    }

    /// Parse file name into components
    /// Supports: PROJECT_SCENE_SHOT_v001.ext and PROJECT_SCENE_SHOT_CONTEXT_v001.ext
    pub fn parse(filename: &str) -> Option<Self> {
        // Remove extension
        let name_without_ext = if let Some(idx) = filename.rfind('.') {
            &filename[..idx]
        } else {
            filename
        };

        let extension = if let Some(idx) = filename.rfind('.') {
            filename[idx + 1..].to_string()
        } else {
            String::new()
        };

        // Pattern: PROJECT_SCENE_SHOT_v001 or PROJECT_SCENE_SHOT_CONTEXT_v001
        // We need to extract version first, then work backwards
        let version_regex = Regex::new(r"_v(\d+)$").ok()?;
        let version_match = version_regex.captures(name_without_ext)?;
        let version = version_match.get(1)?.as_str().parse::<u32>().ok()?;

        // Remove version part to get: PROJECT_SCENE_SHOT or PROJECT_SCENE_SHOT_CONTEXT
        let base = &name_without_ext[..version_match.get(0)?.start()];

        // Split by underscore
        let parts: Vec<&str> = base.split('_').collect();

        // We need at least PROJECT_SCENE_SHOT (3 parts)
        if parts.len() < 3 {
            return None;
        }

        // Last part before optional context is always shot number (SH + 3 digits)
        let shot_part = if parts.len() > 3 {
            // Has context: PROJECT_SCENE_SHSHOT_CONTEXT
            parts[parts.len() - 2]
        } else {
            // No context: PROJECT_SCENE_SHSHOT
            parts[parts.len() - 1]
        };

        // Remove "SH" prefix if present (new format), otherwise parse directly (old format)
        let shot_number = if shot_part.starts_with("SH") {
            shot_part[2..].parse::<u32>().ok()?
        } else {
            shot_part.parse::<u32>().ok()?
        };

        // Special context is the last part if exists
        let special_context = if parts.len() > 3 {
            Some(parts[parts.len() - 1].to_string())
        } else {
            None
        };

        // Scene is everything between project and shot
        let scene_end_idx = if parts.len() > 3 {
            parts.len() - 2
        } else {
            parts.len() - 1
        };

        let scene_name = parts[1..scene_end_idx].join("_");
        let project_name = parts[0].to_string();

        Some(Self {
            project_name,
            scene_name,
            shot_number,
            special_context,
            version,
            extension,
        })
    }

    /// Get project pattern for searching: PROJECT_*
    #[allow(dead_code)]
    pub fn project_pattern(project_name: &str) -> String {
        format!("{}_", project_name.replace(" ", "").to_uppercase())
    }

    /// Get scene pattern for searching: PROJECT_SCENE_*
    pub fn scene_pattern(project_name: &str, scene_name: &str) -> String {
        format!(
            "{}_{}_",
            project_name.replace(" ", "").to_uppercase(),
            scene_name.replace(" ", "").to_uppercase()
        )
    }

    /// Get shot pattern for searching: PROJECT_SCENE_SHSHOT_
    pub fn shot_pattern(project_name: &str, scene_name: &str, shot_number: u32) -> String {
        format!(
            "{}_{}_{}_",
            project_name.replace(" ", "").to_uppercase(),
            scene_name.replace(" ", "").to_uppercase(),
            format!("SH{:0width$}", shot_number, width = SHOT_DIGITS)
        )
    }

    /// Check if filename is versioned (contains _v followed by digits)
    pub fn is_versioned(filename: &str) -> bool {
        let version_regex = Regex::new(r"_v\d+").unwrap();
        version_regex.is_match(filename)
    }

    /// Extract version number from filename
    pub fn extract_version(filename: &str) -> Option<u32> {
        let version_regex = Regex::new(r"_v(\d+)").ok()?;
        let captures = version_regex.captures(filename)?;
        captures.get(1)?.as_str().parse::<u32>().ok()
    }

    /// Extract shot number from filename
    #[allow(dead_code)]
    pub fn extract_shot_number(filename: &str) -> Option<u32> {
        Self::parse(filename).map(|c| c.shot_number)
    }

    /// Extract scene name from filename
    #[allow(dead_code)]
    pub fn extract_scene_name(filename: &str) -> Option<String> {
        Self::parse(filename).map(|c| c.scene_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_simple() {
        let components = FileNameComponents::new(
            "Lion".to_string(),
            "RUNB".to_string(),
            10,
            None,
            10,
            "blend".to_string(),
        );
        assert_eq!(components.build(), "LION_RUNB_010_v010.blend");
    }

    #[test]
    fn test_build_with_context() {
        let components = FileNameComponents::new(
            "Lion".to_string(),
            "RUNB".to_string(),
            10,
            Some("ASSET".to_string()),
            1,
            "blend".to_string(),
        );
        assert_eq!(components.build(), "LION_RUNB_010_ASSET_v001.blend");
    }

    #[test]
    fn test_parse_simple() {
        let parsed = FileNameComponents::parse("LION_RUNB_010_v010.blend").unwrap();
        assert_eq!(parsed.project_name, "LION");
        assert_eq!(parsed.scene_name, "RUNB");
        assert_eq!(parsed.shot_number, 10);
        assert_eq!(parsed.version, 10);
        assert_eq!(parsed.extension, "blend");
        assert_eq!(parsed.special_context, None);
    }

    #[test]
    fn test_parse_with_context() {
        let parsed = FileNameComponents::parse("LION_RUNB_010_ASSET_v001.blend").unwrap();
        assert_eq!(parsed.project_name, "LION");
        assert_eq!(parsed.scene_name, "RUNB");
        assert_eq!(parsed.shot_number, 10);
        assert_eq!(parsed.special_context, Some("ASSET".to_string()));
        assert_eq!(parsed.version, 1);
    }

    #[test]
    fn test_patterns() {
        assert_eq!(
            FileNameComponents::project_pattern("Lion"),
            "LION_"
        );
        assert_eq!(
            FileNameComponents::scene_pattern("Lion", "RUNB"),
            "LION_RUNB_"
        );
        assert_eq!(
            FileNameComponents::shot_pattern("Lion", "RUNB", 10),
            "LION_RUNB_010_"
        );
    }

    #[test]
    fn test_is_versioned() {
        assert!(FileNameComponents::is_versioned("LION_RUNB_010_v010.blend"));
        assert!(!FileNameComponents::is_versioned("LION_RUNB_010.blend"));
    }

    #[test]
    fn test_extract_version() {
        assert_eq!(
            FileNameComponents::extract_version("LION_RUNB_010_v010.blend"),
            Some(10)
        );
        assert_eq!(
            FileNameComponents::extract_version("LION_RUNB_010.blend"),
            None
        );
    }
}
