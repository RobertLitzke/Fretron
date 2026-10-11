// What makes each tour feel like its own: where it goes (the continent and
// its cities), what it sounds like (a genre, with its own colours, type and
// sleeves) and when it is (an era, with its own textures). A tour draws one of
// each from its seed, and the three stack. The colours and type live in
// styles/tour.css, keyed by these ids.

import type { Sleeve } from './tour';

export interface Region {
  name: string;
  cities: readonly string[];
}

export interface Continent {
  id: string;
  /** "European Tour". */
  title: string;
  regions: readonly Region[];
}

export interface Genre {
  id: string;
  /** Under the title: what the tour is a nod to. */
  words: string;
  /** The sleeves its legs are drawn from. */
  sleeves: readonly Sleeve[];
}

export interface Era {
  id: string;
  /** The years a tour of this era can be called. */
  from: number;
  to: number;
}

export const CONTINENTS: readonly Continent[] = [
  {
    id: 'britain',
    title: 'British Tour',
    regions: [
      { name: 'The Midlands', cities: ['Birmingham', 'Wolverhampton', 'Coventry', 'Leicester', 'Nottingham'] },
      { name: 'London', cities: ['Camden', 'Hammersmith', 'Soho', 'Brixton', 'Croydon'] },
      { name: 'The North', cities: ['Manchester', 'Liverpool', 'Leeds', 'Newcastle', 'Sheffield'] },
      { name: 'Scotland', cities: ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee'] },
      { name: 'The West', cities: ['Bristol', 'Cardiff', 'Swansea', 'Bath', 'Plymouth'] },
      { name: 'Ireland', cities: ['Dublin', 'Belfast', 'Cork', 'Galway'] },
    ],
  },
  {
    id: 'europe',
    title: 'European Tour',
    regions: [
      { name: 'Low Countries', cities: ['Amsterdam', 'Rotterdam', 'Brussels', 'Antwerp'] },
      { name: 'France', cities: ['Paris', 'Lyon', 'Marseille', 'Lille', 'Bordeaux'] },
      { name: 'Germany', cities: ['Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt'] },
      { name: 'Scandinavia', cities: ['Stockholm', 'Oslo', 'Copenhagen', 'Helsinki', 'Gothenburg'] },
      { name: 'Italy', cities: ['Rome', 'Milan', 'Turin', 'Bologna', 'Naples'] },
      { name: 'Iberia', cities: ['Madrid', 'Barcelona', 'Lisbon', 'Seville', 'Porto'] },
    ],
  },
  {
    id: 'america',
    title: 'American Tour',
    regions: [
      { name: 'Motor City', cities: ['Detroit', 'Cleveland', 'Chicago', 'Milwaukee', 'Toledo'] },
      { name: 'East Coast', cities: ['New York', 'Philadelphia', 'Boston', 'Baltimore', 'Washington'] },
      { name: 'The South', cities: ['Atlanta', 'Memphis', 'New Orleans', 'Nashville', 'Birmingham AL'] },
      { name: 'Texas', cities: ['Austin', 'Dallas', 'Houston', 'San Antonio', 'El Paso'] },
      { name: 'West Coast', cities: ['Los Angeles', 'San Francisco', 'Seattle', 'San Diego', 'Portland'] },
      { name: 'Canada', cities: ['Toronto', 'Montreal', 'Vancouver', 'Winnipeg', 'Ottawa'] },
    ],
  },
  {
    id: 'pacific',
    title: 'Pacific Tour',
    regions: [
      { name: 'Japan', cities: ['Tokyo', 'Osaka', 'Nagoya', 'Kyoto', 'Fukuoka'] },
      { name: 'East Coast Oz', cities: ['Sydney', 'Brisbane', 'Newcastle NSW', 'Gold Coast'] },
      { name: 'Southern Oz', cities: ['Melbourne', 'Adelaide', 'Perth', 'Hobart'] },
      { name: 'New Zealand', cities: ['Auckland', 'Wellington', 'Christchurch', 'Dunedin'] },
      { name: 'Southeast Asia', cities: ['Singapore', 'Bangkok', 'Manila', 'Kuala Lumpur', 'Jakarta'] },
      { name: 'East Asia', cities: ['Hong Kong', 'Seoul', 'Taipei', 'Busan'] },
    ],
  },
  {
    id: 'latin',
    title: 'Latin American Tour',
    regions: [
      { name: 'Mexico', cities: ['Mexico City', 'Guadalajara', 'Monterrey', 'Tijuana', 'Puebla'] },
      { name: 'Brazil', cities: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre', 'Salvador'] },
      { name: 'River Plate', cities: ['Buenos Aires', 'Montevideo', 'Córdoba', 'Rosario', 'Mendoza'] },
      { name: 'The Andes', cities: ['Santiago', 'Lima', 'Valparaíso', 'Quito', 'La Paz'] },
      { name: 'The North Coast', cities: ['Bogotá', 'Medellín', 'Caracas', 'Cartagena', 'Cali'] },
      { name: 'The Caribbean', cities: ['Havana', 'Kingston', 'San Juan', 'Santo Domingo'] },
    ],
  },
];

export const GENRES: readonly Genre[] = [
  { id: 'hardrock', words: 'hard rock', sleeves: ['record', 'pig', 'prism', 'airship', 'lantern', 'sun'] },
  { id: 'metal', words: 'heavy metal', sleeves: ['moon', 'raven', 'tower', 'eye', 'lantern', 'bolt'] },
  { id: 'beat', words: 'British beat', sleeves: ['roundel', 'submarine', 'crossing', 'record', 'guitar', 'sun'] },
  { id: 'psych', words: 'psychedelic', sleeves: ['spiral', 'eye', 'prism', 'sun', 'moon', 'airship'] },
  { id: 'punk', words: 'punk', sleeves: ['pin', 'crown', 'bolt', 'roundel', 'record', 'guitar'] },
  { id: 'glam', words: 'glam', sleeves: ['bolt', 'star', 'moon', 'spiral', 'eye', 'guitar'] },
];

export const ERAS: readonly Era[] = [
  { id: 'sixties', from: 64, to: 69 },
  { id: 'seventies', from: 70, to: 79 },
  { id: 'eighties', from: 80, to: 89 },
];

/** The kind of venue by how far into a tour a leg is. */
export const VENUES = ['pub back rooms', 'the club circuit', 'ballroom tour', 'theatres', 'arenas', 'stadium encore'];
