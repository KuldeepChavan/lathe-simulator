// Wood species: color palettes (6 gradient stops, raw + oiled), grain colors,
// and density which drives cut rate, chatter threshold, tear-out and edge wear.
export const SPECIES = {
  beech: {
    id: 'beech', name: 'Beech', density: 0.5, hardness: 'Medium',
    wood: ['#54371f', '#7d5330', '#96683a', '#83552e', '#5d3b21', '#38220f'],
    oil: ['#5f3d22', '#93602f', '#b07c44', '#9a6a35', '#6d4526', '#452a14'],
    grainLight: 'rgba(232,199,148,1)', grainDark: 'rgba(52,32,15,1)',
  },
  maple: {
    id: 'maple', name: 'Maple', density: 0.8, hardness: 'Hard',
    wood: ['#8a6a3c', '#c4a061', '#dcc084', '#cfa964', '#9a7844', '#6d5228'],
    oil: ['#967544', '#d4b06c', '#eccf92', '#dcb36e', '#a8854f', '#7c5f30'],
    grainLight: 'rgba(250,235,200,1)', grainDark: 'rgba(150,110,60,1)',
  },
  walnut: {
    id: 'walnut', name: 'Walnut', density: 0.65, hardness: 'Hard',
    wood: ['#33221a', '#503427', '#6b4632', '#5a3a29', '#3d281c', '#241511'],
    oil: ['#3a251a', '#5e3d2b', '#7d5238', '#6b422c', '#48301f', '#2c1a12'],
    grainLight: 'rgba(196,150,108,1)', grainDark: 'rgba(20,10,6,1)',
  },
  cherry: {
    id: 'cherry', name: 'Cherry', density: 0.45, hardness: 'Soft',
    wood: ['#6e3a22', '#a05a30', '#b86e3c', '#a55f31', '#7c4526', '#522c15'],
    oil: ['#7c4326', '#b56a3a', '#cf7f4a', '#b56c3b', '#8a4f2b', '#5e3318'],
    grainLight: 'rgba(240,190,150,1)', grainDark: 'rgba(90,40,18,1)',
  },
  mahogany: {
    id: 'mahogany', name: 'Mahogany', density: 0.6, hardness: 'Medium',
    wood: ['#4a2417', '#713a22', '#8a4a2c', '#7a4026', '#57301d', '#381b10'],
    oil: ['#542a1b', '#83452a', '#9e5735', '#8a4a2c', '#633822', '#422014'],
    grainLight: 'rgba(226,160,120,1)', grainDark: 'rgba(38,16,8,1)',
  },
};

export const OIL_THRESHOLD = 14; // roughness must be at or below this to oil
