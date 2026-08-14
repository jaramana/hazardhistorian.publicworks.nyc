"""Every tunable value for NYC Hazard Historian.

Nothing downstream hard-codes a URL, a threshold, a unit or a category. Change a
value here and rebuild.

The value model is the one decision worth reading before the rest. Source data
distinguishes four kinds of absence and the current NYCEM tool collapses all of
them to zero. Here a measure is always a dict with a status, and a status is
never inferred at render time.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw"
BUILD = ROOT / "build"
STAGING = BUILD / "staging"
SITE = ROOT / "docs"
SITE_DATA = SITE / "data"
DOWNLOADS = SITE / "downloads"

# Requests identify themselves. Several publishers ask for this and it is the
# courteous default even where they do not.
USER_AGENT = (
    "NYCHazardHistorian/1.0 (+https://hazardhistorian.publicworks.nyc) "
    "public-data reconstruction"
)
REQUEST_TIMEOUT = 60
REQUEST_PAUSE = 0.2  # seconds between calls to the same host

# ---------------------------------------------------------------------------
# Value statuses
# ---------------------------------------------------------------------------
# ok          a real measured or published value
# missing     the source covers this event but published no value
# na          the source cannot cover this event, usually because the dataset
#             begins after the event happened
# suppressed  the publisher withheld the value, normally for privacy
# censored    the publisher published a bound rather than a value
#
# Missing is not zero. Not applicable is not missing. A failed lookup must
# never become zero, so every helper that builds a measure takes a status.

STATUS_OK = "ok"
STATUS_MISSING = "missing"
STATUS_NA = "na"
STATUS_SUPPRESSED = "suppressed"
STATUS_CENSORED = "censored"

STATUS_LABELS = {
    STATUS_OK: "Reported",
    STATUS_MISSING: "Not reported",
    STATUS_NA: "Not collected in this period",
    STATUS_SUPPRESSED: "Withheld by the publisher",
    STATUS_CENSORED: "Published as a bound",
}

# ---------------------------------------------------------------------------
# Geography
# ---------------------------------------------------------------------------
# NOAA files a location as a county (CZ_TYPE C) or a Weather Service forecast
# zone (CZ_TYPE Z or M). New York City appears as both and which one is used
# depends on the event type, so a county-only filter loses most winter, heat and
# wind events. Verified against all 77 annual files: see
# research/profile-storm-events.md.
#
# Match on type and code, never on CZ_NAME. The same marine zone appears as both
# "NEW YORK HARBOR" and "New York Harbor" in different years.

BOROUGHS = {
    "BX": {"name": "Bronx", "fips": "36005"},
    "BK": {"name": "Brooklyn", "fips": "36047"},
    "MN": {"name": "Manhattan", "fips": "36061"},
    "QN": {"name": "Queens", "fips": "36081"},
    "SI": {"name": "Staten Island", "fips": "36085"},
}
BOROUGH_ORDER = ["BX", "BK", "MN", "QN", "SI"]

# (CZ_TYPE, CZ_FIPS) -> borough code. Queens holds three entries because the
# zone was split partway through the record, which also means sub-borough
# geography exists for Queens alone and cannot be offered uniformly.
NCEI_GEOGRAPHY = {
    ("C", "005"): "BX",
    ("C", "047"): "BK",
    ("C", "061"): "MN",
    ("C", "081"): "QN",
    ("C", "085"): "SI",
    ("Z", "073"): "BX",
    ("Z", "075"): "BK",
    ("Z", "072"): "MN",
    ("Z", "076"): "QN",
    ("Z", "176"): "QN",
    ("Z", "178"): "QN",
    ("Z", "074"): "SI",
}

# New York Harbor is inside the city's waters and the current NYCEM tool appears
# to include it. Neighbouring marine zones such as Fire Island Inlet to Sandy
# Hook are outside the city and are excluded. Marine records begin in 2002.
NCEI_MARINE = {("Z", "338"), ("M", "338")}
MARINE_LABEL = "New York Harbor"

# ---------------------------------------------------------------------------
# Hazards
# ---------------------------------------------------------------------------
# NOAA publishes 26 event types for New York City. They are folded into the
# hazard vocabulary below. That mapping is a project transformation and is
# published in the methodology. An unmapped NOAA type fails the build rather
# than falling into an "other" bucket.
#
# These keys are the only hazard vocabulary the site uses. An earlier version
# also carried a presentation grouping (Water, Winter, Temperature, Wind) that
# no source publishes and that put drought under Temperature and tropical
# cyclones under Wind. It has been removed rather than corrected: a grouping
# nobody publishes is a claim, and this site does not make claims the record
# does not carry.

HAZARDS = {
    "coastal-flooding": {"label": "Coastal flooding"},
    "flash-flooding": {"label": "Flash flooding"},
    "inland-flooding": {"label": "Inland flooding"},
    "heavy-rain": {"label": "Heavy rain"},
    "winter-storm": {"label": "Winter storm"},
    "heavy-snow": {"label": "Heavy snow"},
    "freezing-precipitation": {"label": "Freezing precipitation"},
    "extreme-cold": {"label": "Extreme cold"},
    "extreme-heat": {"label": "Extreme heat"},
    "high-winds": {"label": "High winds"},
    "thunderstorm": {"label": "Thunderstorm"},
    "tornado": {"label": "Tornado"},
    "tropical-cyclone": {"label": "Tropical cyclone"},
    "hail": {"label": "Hail"},
    "coastal-hazard": {"label": "Coastal hazard"},
    "drought": {"label": "Drought"},
    "fog": {"label": "Dense fog"},
    "wildfire": {"label": "Wildfire"},
}

NCEI_EVENT_TYPE_TO_HAZARD = {
    "Coastal Flood": "coastal-flooding",
    "Storm Surge/Tide": "coastal-flooding",
    "Astronomical Low Tide": "coastal-flooding",
    "Sneakerwave": "coastal-hazard",
    "High Surf": "coastal-hazard",
    "Rip Current": "coastal-hazard",
    "Seiche": "coastal-hazard",
    "Flash Flood": "flash-flooding",
    "Flood": "inland-flooding",
    "Lakeshore Flood": "inland-flooding",
    "Heavy Rain": "heavy-rain",
    "Winter Storm": "winter-storm",
    "Blizzard": "winter-storm",
    "Winter Weather": "winter-storm",
    "Lake-Effect Snow": "heavy-snow",
    "Heavy Snow": "heavy-snow",
    "Ice Storm": "freezing-precipitation",
    "Sleet": "freezing-precipitation",
    "Freezing Fog": "freezing-precipitation",
    "Frost/Freeze": "extreme-cold",
    "Cold/Wind Chill": "extreme-cold",
    "Extreme Cold/Wind Chill": "extreme-cold",
    "Heat": "extreme-heat",
    "Excessive Heat": "extreme-heat",
    "High Wind": "high-winds",
    "Strong Wind": "high-winds",
    "Thunderstorm Wind": "thunderstorm",
    "Lightning": "thunderstorm",
    "Funnel Cloud": "thunderstorm",
    "Tornado": "tornado",
    "Waterspout": "tornado",
    "Hurricane": "tropical-cyclone",
    "Hurricane (Typhoon)": "tropical-cyclone",
    "Tropical Storm": "tropical-cyclone",
    "Tropical Depression": "tropical-cyclone",
    "Marine Tropical Storm": "tropical-cyclone",
    "Marine Hurricane/Typhoon": "tropical-cyclone",
    "Hail": "hail",
    "Marine Hail": "hail",
    "Marine High Wind": "high-winds",
    "Marine Strong Wind": "high-winds",
    "Marine Thunderstorm Wind": "thunderstorm",
    "Drought": "drought",
    "Dense Fog": "fog",
    "Marine Dense Fog": "fog",
    "Dense Smoke": "wildfire",
    "Wildfire": "wildfire",
    "Debris Flow": "inland-flooding",
    "Dust Devil": "high-winds",
    "Dust Storm": "high-winds",
    "Heavy Seas": "coastal-hazard",
    "Marine Lightning": "thunderstorm",
}

# ---------------------------------------------------------------------------
# Event definition
# ---------------------------------------------------------------------------
# A NOAA event row is one event type in one place. A NOAA episode is one weather
# system. The site's event is the episode, because the episodes in January 2000
# map exactly onto the first four events of the tool this replaces.
#
# Sandy is the exception that proves the rule: NOAA files it as two episodes,
# coastal flood and high wind, that plainly belong to one storm. Merging every
# overlapping episode automatically produced 982 events and moved to 614 on a
# six-hour tolerance change, which is far too sensitive to be a structural rule.
# So merges are declared here, by hand, and there are few of them.
#
# Each entry: a stable id, a display name, and the NOAA episode ids to merge.

EVENT_MERGES = [
    {"id": "E20121029-sandy", "name": "Hurricane Sandy",
     "episodes": ["70044", "68867"]},
    {"id": "E20210901-ida", "name": "Post-Tropical Cyclone Ida",
     "episodes": []},  # filled by episode lookup below if a merge proves needed
]

# Events NOAA does not name. A name is editorial, so named events are declared
# rather than generated, and everything else shows its hazards and its date.
EVENT_NAMES = {
    "E20120628-": None,
}

# Rows carrying no EPISODE_ID, which is most of the pre-1996 record, become
# single-episode events keyed on the event id instead.
SYNTHETIC_EPISODE_PREFIX = "solo-"

# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

SOURCES = {
    "ncei-storm-events": {
        "publisher": "NOAA National Centers for Environmental Information",
        "name": "Storm Events Database",
        "url": "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/",
        "listing": "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/",
        "licence": "US Government work, public domain",
        "grain": "One row per event type, per place, per time window",
        "coverage": "1950 to present. All event types only from 1996.",
        "caveat": (
            "Before 1996 only tornado, hail and wind were recorded, so counts "
            "before that year measure what was collected as much as what "
            "happened."
        ),
    },
    "hurdat2": {
        "publisher": "NOAA National Hurricane Center",
        "name": "HURDAT2 Atlantic best track",
        "url": "https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-02272026.txt",
        "licence": "US Government work, public domain",
        "grain": "One row per storm per six-hour synoptic time",
        "coverage": "1851 to 2025",
        "caveat": "Best track is a post-season reanalysis, not live observation.",
    },
    "ghcn-daily": {
        "publisher": "NOAA National Centers for Environmental Information",
        "name": "Global Historical Climatology Network, daily",
        "url": "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/",
        "licence": "US Government work, public domain",
        "grain": "One row per station per day",
        "coverage": "Station dependent. Central Park from 1869.",
        "caveat": (
            "Daily summaries, not hourly. Rainfall rate and heat index cannot be "
            "derived from them and are not offered."
        ),
    },
    "coops": {
        "publisher": "NOAA Center for Operational Oceanographic Products and Services",
        "name": "Tides and Currents water levels",
        "url": "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter",
        "licence": "US Government work, public domain",
        "grain": "One reading per station per six minutes",
        "coverage": "Station dependent. The Battery from 1920.",
        "caveat": (
            "Surge is observed water level minus predicted tide. It is derived "
            "by this project, not published as such."
        ),
    },
    "iem-radar": {
        "publisher": "Iowa State University, Iowa Environmental Mesonet",
        "name": "NEXRAD composite reflectivity tile archive",
        "url": "https://mesonet.agron.iastate.edu/",
        "licence": "Open access, attribution requested",
        "grain": "One raster tile per five-minute step",
        "coverage": "N0R from the 1990s, N0Q from 2011",
        "caveat": (
            "A national composite, not a single-radar product. Tiles are read "
            "live from the archive rather than copied."
        ),
    },
    "fema-pa": {
        "publisher": "FEMA",
        "name": "Public Assistance Funded Projects Details, v2",
        "url": "https://www.fema.gov/api/open/v2/PublicAssistanceFundedProjectsDetails",
        "licence": "US Government work, public domain",
        "grain": "One row per project worksheet",
        "coverage": "1998 to present",
        "caveat": (
            "Obligations continue for years after an event, so a total is only "
            "true as at the snapshot date."
        ),
    },
    "fema-ia-owners": {
        "publisher": "FEMA",
        "name": "Housing Assistance Program Data, Owners, v2",
        "url": "https://www.fema.gov/api/open/v2/HousingAssistanceOwners",
        "licence": "US Government work, public domain",
        "grain": "One row per disaster per ZIP code",
        "coverage": "2002 to present",
        "caveat": "Owners and renters are separate populations and are not summed.",
    },
    "fema-ia-renters": {
        "publisher": "FEMA",
        "name": "Housing Assistance Program Data, Renters, v2",
        "url": "https://www.fema.gov/api/open/v2/HousingAssistanceRenters",
        "licence": "US Government work, public domain",
        "grain": "One row per disaster per ZIP code",
        "coverage": "2002 to present",
        "caveat": "Owners and renters are separate populations and are not summed.",
    },
    "fema-nfip": {
        "publisher": "FEMA",
        "name": "NFIP Redacted Claims, v3",
        "url": "https://www.fema.gov/api/open/v3/NfipClaims",
        "licence": "US Government work, public domain",
        "grain": "One row per claim",
        "coverage": "1978 to present",
        "caveat": (
            "Claims join to an event by date of loss, not by declaration, so "
            "they exist for undeclared events too. v2 is deprecated from "
            "15 October 2026."
        ),
    },
    "fema-declarations": {
        "publisher": "FEMA",
        "name": "Disaster Declarations Summaries, v2",
        "url": "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries",
        "licence": "US Government work, public domain",
        "grain": "One row per disaster per county",
        "coverage": "1953 to present",
        "caveat": "",
    },
    "nyc-311": {
        "publisher": "NYC Open Data",
        "name": "311 Service Requests",
        "url": "https://data.cityofnewyork.us/",
        "licence": "NYC Open Data terms",
        "grain": "One row per service request",
        "coverage": "2004 to present, across eight datasets",
        "caveat": (
            "Resident-reported, so it measures reporting as well as impact. "
            "Complaint vocabularies change across the dataset splits."
        ),
    },
    "nyc-collisions": {
        "publisher": "NYC Open Data, NYPD",
        "name": "Motor Vehicle Collisions, Crashes",
        "url": "https://data.cityofnewyork.us/resource/h9gi-nx95.json",
        "licence": "NYC Open Data terms",
        "grain": "One row per reported collision",
        "coverage": "July 2012 to present",
        "caveat": "Nothing before July 2012. That is not applicable, not zero.",
    },
    "bls-cpi": {
        "publisher": "US Bureau of Labor Statistics",
        "name": "CPI-U, New York-Newark-Jersey City, all items",
        "url": "https://api.bls.gov/publicAPI/v2/timeseries/data/CUURS12ASA0",
        "licence": "US Government work, public domain",
        "grain": "One index value per month",
        "coverage": "1953 to present",
        "caveat": (
            "A metropolitan index. Deflating New York losses by the national "
            "index would understate them."
        ),
    },
}

# ---------------------------------------------------------------------------
# Weather stations
# ---------------------------------------------------------------------------
# GHCN-Daily identifiers, verified individually. Daily summaries rather than the
# hourly Local Climatological Data files, which run to about 7 MB per station
# per year and would put roughly two gigabytes of raw CSV in the pipeline for
# measures the site reports as event peaks anyway.

WEATHER_STATIONS = {
    "USW00094728": {"name": "Central Park", "borough": "MN",
                    "lat": 40.7789, "lon": -73.9692},
    "USW00014732": {"name": "LaGuardia Airport", "borough": "QN",
                    "lat": 40.7794, "lon": -73.8803},
    "USW00094789": {"name": "John F. Kennedy Airport", "borough": "QN",
                    "lat": 40.6386, "lon": -73.7622},
    "USW00014734": {"name": "Newark Liberty Airport", "borough": None,
                    "lat": 40.6825, "lon": -74.1694},
}

# GHCN element -> the site's measure. Tenths are converted here and nowhere else.
GHCN_ELEMENTS = {
    "TMAX": {"measure": "temp_max", "unit": "F", "convert": "tenths_c_to_f"},
    "TMIN": {"measure": "temp_min", "unit": "F", "convert": "tenths_c_to_f"},
    "PRCP": {"measure": "rain_daily", "unit": "in", "convert": "tenths_mm_to_in"},
    "SNOW": {"measure": "snow_daily", "unit": "in", "convert": "mm_to_in"},
    "SNWD": {"measure": "snow_depth", "unit": "in", "convert": "mm_to_in"},
    "AWND": {"measure": "wind_avg", "unit": "mph", "convert": "tenths_ms_to_mph"},
    # WSF2 is the fastest two-minute wind, not the peak gust. GHCN-Daily
    # publishes the peak gust separately as WSFG, which these four stations do
    # not report. The measure is named for what it is: calling a two-minute
    # mean a gust would overstate every wind figure on the site by the exact
    # amount a gust exceeds a two-minute mean.
    "WSF2": {"measure": "wind_2min", "unit": "mph", "convert": "tenths_ms_to_mph"},
}

# ---------------------------------------------------------------------------
# Tide gauges
# ---------------------------------------------------------------------------
TIDE_STATIONS = {
    "8518750": {"name": "The Battery", "borough": "MN",
                "lat": 40.7006, "lon": -74.0142},
    "8516945": {"name": "Kings Point", "borough": "QN",
                "lat": 40.8103, "lon": -73.7649},
    "8531680": {"name": "Sandy Hook", "borough": None,
                "lat": 40.4669, "lon": -74.0094},
}
TIDE_DATUM = "MLLW"
TIDE_UNITS = "english"

# Surge is derived. Only fetch tides where a coastal question is plausible,
# because each event costs two API calls per station.
TIDE_HAZARDS = {"coastal-flooding", "tropical-cyclone", "coastal-hazard",
                "high-winds", "flash-flooding"}

# ---------------------------------------------------------------------------
# 311 and collisions
# ---------------------------------------------------------------------------
# The 311 record is split across eight datasets and the vocabulary moves between
# them. Counts are fetched as aggregates rather than rows, so the pipeline never
# handles 22 million records.

NYC_311_DATASETS = [
    {"id": "erm2-nwe9", "from": "2020-01-01", "to": "2100-01-01"},
    {"id": "76ig-c548", "from": "2010-01-01", "to": "2019-12-31"},
    {"id": "3rfa-3xsf", "from": "2009-01-01", "to": "2009-12-31"},
    {"id": "uzcy-9puk", "from": "2008-01-01", "to": "2008-12-31"},
    {"id": "aiww-p3af", "from": "2007-01-01", "to": "2007-12-31"},
    {"id": "hy4q-igkk", "from": "2006-01-01", "to": "2006-12-31"},
    {"id": "sxmw-f24h", "from": "2005-01-01", "to": "2005-12-31"},
    {"id": "sqcr-6mww", "from": "2004-01-01", "to": "2004-12-31"},
]
NYC_311_START = "2004-01-01"  # before this, 311 is not applicable, not missing

# Complaint families. Matching is on the complaint_type text because that is the
# only key 311 offers, and the text changes across the dataset splits, so each
# family lists every spelling seen rather than a single value.
COMPLAINT_FAMILIES = {
    "no-heat": {
        "label": "No heat or hot water",
        "hazards": ["extreme-cold", "winter-storm", "heavy-snow"],
        "types": ["HEAT/HOT WATER", "HEATING", "HEAT"],
    },
    "flooding": {
        "label": "Street and sewer flooding",
        "hazards": ["flash-flooding", "inland-flooding", "coastal-flooding",
                    "heavy-rain", "tropical-cyclone"],
        "types": ["Sewer", "Water System", "Flooding", "Catch Basin Clogged/Flooding (Use Comments) (SC)"],
    },
    "trees": {
        "label": "Tree emergencies",
        "hazards": ["high-winds", "thunderstorm", "tropical-cyclone",
                    "winter-storm", "tornado"],
        "types": ["Damaged Tree", "Dead Tree", "Dead/Dying Tree", "Overgrown Tree/Branches",
                  "Illegal Tree Damage", "Forestry", "New Tree Request"],
    },
}

COLLISIONS_DATASET = "h9gi-nx95"
COLLISIONS_START = "2012-07-01"

# The window a consequence may be attributed to, in days added after the event
# ends. They are not the same for every dataset and the site must not imply they
# are. A 311 request about a storm is often filed the next morning, so the
# complaint families carry a following day. A collision is timestamped when it
# happened, so it does not. Claims join on the date of loss, which behaves like
# a complaint at the edges of a multi-day storm.
CONSEQUENCE_WINDOWS = {
    "nyc-311": {"pad_days": 1,
                "label": "the event window and the following day"},
    "nyc-collisions": {"pad_days": 0,
                       "label": "the event window only"},
    "fema-nfip": {"pad_days": 1,
                  "label": "the event window and the following day, by date of loss"},
}

# NYC Open Data allows anonymous use at a lower rate. An app token, if one is
# set in the environment as NYC_APP_TOKEN, raises the limit and is used
# automatically. None is required.
SOCRATA_HOST = "data.cityofnewyork.us"

# ---------------------------------------------------------------------------
# FEMA
# ---------------------------------------------------------------------------
NYC_COUNTY_CODES = ["36005", "36047", "36061", "36081", "36085"]
NYC_COUNTY_NAMES = ["Bronx", "Kings", "New York", "Queens", "Richmond"]
FEMA_PAGE_SIZE = 5000

# A FEMA disaster maps to an event by declaration and incident dates. Assistance
# is reported against the disaster, not the storm, so the join is declared here
# for the disasters that matter and inferred by incident window otherwise.
FEMA_INCIDENT_MATCH_DAYS = 3  # tolerance around the incident period

# Two guards, both learned from a wrong number reaching a page.
#
# The COVID-19 declarations, DR-4480 and EM-3434, carry an incident period from
# January 2020 to May 2023. Matching on overlap alone attached them, and their
# billions of public assistance, to every storm in three years. Ida showed
# 10.7 billion dollars of public assistance, almost all of it pandemic money.
#
# So a declaration must be a weather incident, and its incident period must be
# short enough to belong to one storm. A declaration that fails either test is
# not attached to any event and is not silently redistributed either.
FEMA_INCIDENT_TYPES = {
    "Hurricane", "Severe Storm", "Severe Storm(s)", "Flood", "Snowstorm",
    "Tornado", "Coastal Storm", "Severe Ice Storm", "Winter Storm",
    "Typhoon", "Tropical Storm", "Freezing", "Drought", "Fire",
}
FEMA_MAX_INCIDENT_DAYS = 45

# ---------------------------------------------------------------------------
# Inflation
# ---------------------------------------------------------------------------
CPI_SERIES = "CUURS12ASA0"
# Every adjusted dollar on the site is in this year's money. It must be a year
# with all twelve months published, so it lags the current year by one. The
# fetch stage says so when the year it is given is still incomplete.
CPI_BASE_YEAR = 2024
CPI_START_YEAR = 1953

# ---------------------------------------------------------------------------
# Radar
# ---------------------------------------------------------------------------
# Two products cover different halves of the record. N0Q returned 503 for 2012
# and 200 for 2021 when probed, so the changeover is chosen conservatively and
# the site states which product it is showing.
RADAR = {
    "template": "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/{layer}/{z}/{x}/{y}.png",
    "products": [
        {"id": "N0Q", "layer": "ridge::USCOMP-N0Q-{ts}", "from": "2011-01-01",
         "label": "Base reflectivity, 0.25 dBZ resolution"},
        {"id": "N0R", "layer": "ridge::USCOMP-N0R-{ts}", "from": "1995-01-01",
         "label": "Base reflectivity, 5 dBZ resolution"},
    ],
    "step_minutes": 5,
    "max_frames": 96,  # eight hours at five minutes, enough for any single event
    "attribution": "Radar imagery: Iowa Environmental Mesonet, Iowa State University",
}

# ---------------------------------------------------------------------------
# Basemap
# ---------------------------------------------------------------------------
BASEMAP = {
    "tiles": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    "attribution": "Basemap: CARTO, OpenStreetMap contributors",
    "center": [-73.95, 40.70],
    "zoom": 9.2,
}

# ---------------------------------------------------------------------------
# Filterable characteristics
# ---------------------------------------------------------------------------
# The mock-ups asked for characteristic, operator, value and unit, which is what
# the site offers. Fixed bands could not answer "above a chosen threshold", which
# the brief asks for directly.

# Each carries a note saying how the number was produced, because a threshold
# is only meaningful against a known method. "At least 6 inches of snow" means
# something different if the figure is a citywide mean, a single station's day,
# or a station total across a week. Here it is the last of those, and it says so.

CHARACTERISTICS = {
    "temp_max": {"label": "Highest temperature", "unit": "F", "step": 1,
                 "source": "ghcn-daily",
                 "note": "Highest single daily maximum at any one station."},
    "temp_min": {"label": "Lowest temperature", "unit": "F", "step": 1,
                 "source": "ghcn-daily",
                 "note": "Lowest single daily minimum at any one station."},
    "rain_daily": {"label": "Rainfall, heaviest day", "unit": "in", "step": 0.1,
                   "source": "ghcn-daily",
                   "note": "Largest single station-day total in the window."},
    "rain_total": {"label": "Rainfall, event total", "unit": "in", "step": 0.1,
                   "source": "ghcn-daily",
                   "note": "Summed across the window at the wettest single "
                           "station, never added across stations."},
    "snow_daily": {"label": "Snowfall, heaviest day", "unit": "in", "step": 0.5,
                   "source": "ghcn-daily",
                   "note": "Largest single station-day total in the window."},
    "snow_total": {"label": "Snowfall, event total", "unit": "in", "step": 0.5,
                   "source": "ghcn-daily",
                   "note": "Summed across the window at the snowiest single "
                           "station, never added across stations."},
    "wind_2min": {"label": "Fastest two-minute wind", "unit": "mph", "step": 5,
                  "source": "ghcn-daily",
                  "note": "GHCN element WSF2, a two-minute mean. Not a gust: "
                          "these stations do not report peak gust."},
    "surge_peak": {"label": "Peak storm surge, derived", "unit": "ft", "step": 0.5,
                   "source": "coops",
                   "note": "Observed water level minus predicted tide at The "
                           "Battery. Derived here, not published."},
    "tide_peak": {"label": "Peak water level", "unit": "ft MLLW", "step": 0.5,
                  "source": "coops",
                  "note": "Highest observed reading at The Battery on the "
                          "MLLW datum. Coastal events only."},
    "deaths": {"label": "Deaths, direct", "unit": "", "step": 1,
               "source": "ncei-storm-events",
               "note": "Weather Service count. Indirect deaths are counted "
                       "separately and never added to this."},
    "injuries": {"label": "Injuries, direct", "unit": "", "step": 1,
                 "source": "ncei-storm-events",
                 "note": "Weather Service count for this event's records."},
    "damage_property": {"label": "Property damage, as published", "unit": "$",
                        "step": 1000, "source": "ncei-storm-events",
                        "note": "Weather Service estimate, summed over this "
                                "event's records. Nominal dollars."},
    "fema_pa": {"label": "Public assistance to the declaration", "unit": "$",
                "step": 1000, "source": "fema-pa",
                "note": "Federal share obligated to the disaster declarations "
                        "covering this event, for New York City counties. It "
                        "belongs to the declaration, not to the storm."},
    "fema_ia": {"label": "Housing assistance to the declaration", "unit": "$",
                "step": 1000, "source": "fema-ia-owners",
                "note": "Individuals and Households Program approved to those "
                        "declarations, owners and renters, New York City ZIP "
                        "codes. Belongs to the declaration."},
    "nfip_paid": {"label": "Flood insurance paid", "unit": "$", "step": 1000,
                  "source": "fema-nfip",
                  "note": "Claims joined by date of loss inside the window, so "
                          "they exist for undeclared events too."},
    "complaints_311": {"label": "311 complaints, no heat or hot water",
                       "unit": "", "step": 10, "source": "nyc-311",
                       "note": "Resident-reported requests in the window and "
                               "the day after. Measures reporting as well as "
                               "impact."},
    "complaints_flooding": {"label": "311 complaints, street and sewer flooding",
                            "unit": "", "step": 10, "source": "nyc-311",
                            "note": "Resident-reported requests in the window "
                                    "and the day after."},
    "complaints_trees": {"label": "311 complaints, tree emergencies",
                         "unit": "", "step": 10, "source": "nyc-311",
                         "note": "Resident-reported requests in the window and "
                                 "the day after."},
    "collisions": {"label": "Vehicle collisions", "unit": "", "step": 10,
                   "source": "nyc-collisions",
                   "note": "Police-reported collisions inside the event "
                           "window, with no following day."},
}

OPERATORS = {
    "gte": {"label": "at least", "symbol": "≥"},
    "lte": {"label": "at most", "symbol": "≤"},
    "btw": {"label": "between", "symbol": "–"},
}

# ---------------------------------------------------------------------------
# Validation thresholds
# ---------------------------------------------------------------------------
# The build fails on these. A threshold that starts failing is a signal to read
# the source, not to raise the number.

VALIDATION = {
    "min_events": 600,
    "max_events": 1200,
    "min_event_rows": 2000,
    "min_year": 1950,
    "max_future_days": 2,
    "max_borough_share": 0.60,   # no single borough should hold most rows
    "required_hazard_coverage": 12,  # distinct hazards that must appear
    "max_unmapped_event_types": 0,
    "min_stations_reporting": 2,
}

# ---------------------------------------------------------------------------
# Site
# ---------------------------------------------------------------------------
SITE_NAME = "NYC Hazard Historian"
SITE_HOST = "hazardhistorian.publicworks.nyc"
EVENTS_PER_PAGE = 25
COMPARE_MAX = 4
