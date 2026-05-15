const PRESETS = {
    page: {
        recursive: false,
        maxDepth: 1,
        engineMode: 'auto',
        dynamic: false,
        autoDynamic: true,
        useSitemap: false
    },
    full: {
        recursive: true,
        maxDepth: 2,
        engineMode: 'auto',
        dynamic: false,
        autoDynamic: true,
        useSitemap: true
    },
    mirror: {
        recursive: true,
        maxDepth: 5,
        engineMode: 'auto',
        dynamic: false,
        autoDynamic: true,
        useSitemap: true
    }
};

function applyPreset(options, presetName) {
    const preset = PRESETS[presetName] || PRESETS.page;
    return { ...preset, ...options };
}

module.exports = { PRESETS, applyPreset };
