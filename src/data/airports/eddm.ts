import type { AirportData } from '../../core/airport/types';
import { EDDM_LAYOUT } from './eddm.layout';
import { buildLayout, exitVia, layoutEdges, type StandSpec } from './osmLayout';

/**
 * München (EDDM), the second hub of Lufthansa: two parallel runways 2.3 km apart, both used for take-offs and
 * landings, with independent parallel approaches.
 *
 * Layout: OpenStreetMap (© OpenStreetMap contributors, ODbL), imported with scripts/osm-import.mjs
 * (eddm.layout.ts). Facts: DFS AIP AD 2 EDDM (AIRAC 2026-10-29) with its aerodrome chart, aircraft parking /
 * docking charts and SID charts, used as a reference only: runways, thresholds, declared distances with the
 * intersection take-offs, taxiway designators, holding points, the high-speed turn-offs (HIRO), the runway use
 * by direction, the stand list with its coordinates, frequencies, the RNAV SIDs. See docs/airports/EDDM.md.
 *
 * Runway use (AIP AD 2.20 3.1.4 / 3.2.1): departures to the north and north-east from the northern runway
 * 08L/26R, to the south-west, south and south-east from the southern one 08R/26L; to the north-west from 26L or
 * 08L. Arrivals via ROKIL / LANDU (north) land on the northern runway, via NAPSA / BETOS (south) on the southern.
 *
 * Simplifications: stand sizes estimated (the centre position of a stand with A / B positions code E, the A / B
 * positions code C, the others by their spacing); the stands of the maintenance aprons 7 and 8 (7xx / 8xx) and
 * the de-icing areas drawn, not used; A7 and B9 (closed on the aerodrome chart) drawn, not used.
 */

/**
 * Stands of the AIP stand list: [designator, apron, largest wingspan (m), pushback, lead-in line in OpenStreetMap,
 * lat, lon, use] - the position is the AIP stand coordinate. Without a lead-in line in OpenStreetMap the lane node is
 * put on the nearest apron taxiway. 99-108 (the new pier of Terminal 1, under construction on the aerodrome chart, no
 * taxilanes in OpenStreetMap) are left out.
 */
const STANDS: [string, string, number, boolean, boolean, number, number, ('ga' | 'cargo')?][] = [
  ['110', '1', 36, true, true, 48.3537750, 11.7834306],
  ['111', '1', 65, true, false, 48.3532333, 11.7835250],
  ['111A', '1', 36, true, true, 48.3532889, 11.7835167],
  ['111B', '1', 36, true, true, 48.3531722, 11.7835361],
  ['112', '1', 65, true, true, 48.3528000, 11.7836000],
  ['112X', '1', 36, true, false, 48.3527944, 11.7835222],
  ['113A', '1', 36, true, true, 48.3523583, 11.7836750],
  ['113B', '1', 36, true, true, 48.3523139, 11.7836833],
  ['113X', '1', 36, true, true, 48.3523472, 11.7836500],
  ['115A', '1', 36, true, true, 48.3513444, 11.7838528],
  ['115B', '1', 36, true, true, 48.3512639, 11.7838667],
  ['116', '1', 36, true, true, 48.3509167, 11.7839250],
  ['117A', '1', 36, true, true, 48.3506028, 11.7839806],
  ['117B', '1', 36, true, true, 48.3504861, 11.7840000],
  ['118', '1', 36, true, true, 48.3500000, 11.7840861],
  ['119', '1', 36, true, true, 48.3495139, 11.7841694],
  ['120', '1', 36, true, true, 48.3490361, 11.7842528],
  ['121', '1', 36, true, true, 48.3486694, 11.7843167],
  ['135', '1', 36, true, true, 48.3526250, 11.7802111],
  ['155', '1', 36, true, true, 48.3525833, 11.7796528],
  ['161', '1', 65, true, true, 48.3511528, 11.7799000],
  ['161Y', '1', 36, true, true, 48.3510944, 11.7796389],
  ['162', '1', 36, true, true, 48.3507250, 11.7799722],
  ['163', '1', 65, true, true, 48.3502389, 11.7800583],
  ['163Y', '1', 36, true, true, 48.3501889, 11.7798750],
  ['164', '1', 65, true, true, 48.3497500, 11.7801417],
  ['164Y', '1', 36, true, true, 48.3497500, 11.7800528],
  ['171', '1', 36, true, true, 48.3573500, 11.7757972],
  ['172', '1', 36, true, true, 48.3569222, 11.7758694],
  ['173', '1', 36, true, true, 48.3564944, 11.7759444],
  ['174', '1', 36, true, true, 48.3560667, 11.7760194],
  ['175', '1', 36, true, true, 48.3555833, 11.7761028],
  ['181', '1', 36, true, true, 48.3549472, 11.7762139],
  ['182', '1', 36, true, true, 48.3545778, 11.7762778],
  ['183', '1', 36, true, true, 48.3541472, 11.7763528],
  ['184', '1', 36, true, true, 48.3536611, 11.7764361],
  ['185', '1', 36, true, true, 48.3531750, 11.7765194],
  ['186', '1', 36, true, true, 48.3526889, 11.7766056],
  ['187', '1', 36, true, true, 48.3522000, 11.7766889],
  ['188', '1', 36, true, true, 48.3517722, 11.7767639],
  ['189', '1', 36, true, true, 48.3514028, 11.7768278],
  ['191', '1', 36, true, true, 48.3508750, 11.7769194],
  ['192', '1', 36, true, true, 48.3504472, 11.7769917],
  ['193', '1', 36, true, true, 48.3500194, 11.7770667],
  ['194', '1', 36, true, true, 48.3495917, 11.7771417],
  ['195', '1', 36, true, true, 48.3491639, 11.7772167],
  ['201', '2', 36, true, false, 48.3588889, 11.7918139],
  ['202A', '2', 36, true, true, 48.3584611, 11.7918889],
  ['202B', '2', 36, true, true, 48.3583806, 11.7919028],
  ['203', '2', 36, true, true, 48.3581167, 11.7919500],
  ['204A', '2', 36, true, true, 48.3578444, 11.7919972],
  ['204B', '2', 36, true, true, 48.3577556, 11.7920111],
  ['205A', '2', 36, true, true, 48.3574278, 11.7920667],
  ['205B', '2', 36, true, true, 48.3573528, 11.7920806],
  ['206', '2', 36, true, true, 48.3570833, 11.7921278],
  ['207A', '2', 36, true, true, 48.3568611, 11.7921667],
  ['207B', '2', 36, true, true, 48.3567417, 11.7921861],
  ['208', '2', 36, true, true, 48.3563972, 11.7922472],
  ['209A', '2', 36, true, true, 48.3559806, 11.7923194],
  ['209B', '2', 36, true, true, 48.3559139, 11.7923306],
  ['210A', '2', 36, true, true, 48.3555611, 11.7923917],
  ['210B', '2', 36, true, true, 48.3554222, 11.7924139],
  ['211', '2', 36, true, true, 48.3552167, 11.7924500],
  ['212A', '2', 36, true, true, 48.3549444, 11.7924972],
  ['212B', '2', 36, true, true, 48.3548722, 11.7925111],
  ['213A', '2', 36, true, true, 48.3545306, 11.7925694],
  ['213B', '2', 36, true, true, 48.3544611, 11.7925806],
  ['214', '2', 36, true, true, 48.3541028, 11.7926444],
  ['215A', '2', 36, true, true, 48.3535056, 11.7927472],
  ['215B', '2', 36, true, true, 48.3534278, 11.7927611],
  ['216', '2', 36, true, true, 48.3530139, 11.7928306],
  ['217A', '2', 36, true, true, 48.3526722, 11.7928917],
  ['217B', '2', 36, true, true, 48.3525250, 11.7929167],
  ['218', '2', 36, true, true, 48.3523278, 11.7929500],
  ['219A', '2', 36, true, true, 48.3520333, 11.7930028],
  ['219B', '2', 36, true, true, 48.3519833, 11.7930111],
  ['220A', '2', 36, true, true, 48.3516389, 11.7930694],
  ['220B', '2', 36, true, true, 48.3515417, 11.7930861],
  ['221', '2', 36, true, true, 48.3512944, 11.7931306],
  ['222A', '2', 36, true, true, 48.3510500, 11.7931722],
  ['222B', '2', 36, true, true, 48.3509500, 11.7931889],
  ['223A', '2', 36, true, true, 48.3505833, 11.7932528],
  ['223B', '2', 36, true, true, 48.3505333, 11.7932611],
  ['224A', '2', 36, true, true, 48.3501639, 11.7933250],
  ['224B', '2', 36, true, true, 48.3501222, 11.7933333],
  ['232', '2', 36, true, true, 48.3506472, 11.7921944],
  ['233', '2', 36, true, true, 48.3503194, 11.7922528],
  ['234', '2', 36, true, true, 48.3499889, 11.7923083],
  ['244', '2', 36, true, true, 48.3573472, 11.7974472],
  ['245', '2', 36, true, true, 48.3569750, 11.7975111],
  ['246', '2', 36, true, true, 48.3566056, 11.7975750],
  ['247', '2', 36, true, true, 48.3562333, 11.7976389],
  ['248A', '2', 36, true, true, 48.3558639, 11.7977028],
  ['248B', '2', 36, true, true, 48.3557778, 11.7977194],
  ['249A', '2', 36, true, true, 48.3553583, 11.7977917],
  ['249B', '2', 36, true, true, 48.3552417, 11.7978111],
  ['250', '2', 36, true, true, 48.3547333, 11.7979000],
  ['251A', '2', 36, true, true, 48.3542250, 11.7979861],
  ['251B', '2', 36, true, true, 48.3541083, 11.7980083],
  ['252A', '2', 36, true, true, 48.3536889, 11.7980806],
  ['252B', '2', 36, true, true, 48.3536028, 11.7980944],
  ['253', '2', 36, true, true, 48.3532333, 11.7981583],
  ['254', '2', 36, true, true, 48.3528611, 11.7982222],
  ['255', '2', 36, true, true, 48.3524917, 11.7982861],
  ['256', '2', 36, true, true, 48.3521194, 11.7983500],
  ['261', '2', 36, true, true, 48.3498278, 11.7979722],
  ['262', '2', 36, true, true, 48.3497806, 11.7983167],
  ['263', '2', 36, true, true, 48.3498778, 11.7986306],
  ['301', '3', 65, true, true, 48.3572417, 11.7989861],
  ['301A', '3', 36, true, true, 48.3574111, 11.7989583],
  ['301B', '3', 36, true, true, 48.3570472, 11.7990194],
  ['302', '3', 65, true, true, 48.3564556, 11.7991222],
  ['302A', '3', 36, true, true, 48.3566278, 11.7990917],
  ['302B', '3', 36, true, true, 48.3562667, 11.7991556],
  ['308', '3', 36, true, true, 48.3558472, 11.7996333],
  ['309', '3', 36, true, true, 48.3554694, 11.7997000],
  ['310', '3', 36, true, true, 48.3550500, 11.7997722],
  ['311', '3', 36, true, true, 48.3546278, 11.7998444],
  ['312', '3', 36, true, true, 48.3542083, 11.7999194],
  ['313', '3', 36, true, true, 48.3537778, 11.7998556],
  ['317', '3', 65, true, true, 48.3531750, 11.7996889],
  ['317A', '3', 36, true, true, 48.3533417, 11.7996611],
  ['317B', '3', 36, true, true, 48.3529806, 11.7997222],
  ['318', '3', 65, true, true, 48.3523917, 11.7998250],
  ['318A', '3', 36, true, false, 48.3525611, 11.7997972],
  ['318B', '3', 36, true, true, 48.3522000, 11.7998583],
  ['321', '3', 36, true, true, 48.3564333, 11.8025361],
  ['322', '3', 36, true, true, 48.3559944, 11.8026111],
  ['323', '3', 36, true, true, 48.3555583, 11.8026861],
  ['324', '3', 36, true, true, 48.3551194, 11.8027611],
  ['325', '3', 36, true, true, 48.3546806, 11.8028389],
  ['327', '3', 36, true, true, 48.3537278, 11.8030167],
  ['328', '3', 36, true, true, 48.3533167, 11.8030861],
  ['329', '3', 36, true, true, 48.3529056, 11.8031583],
  ['330', '3', 36, true, true, 48.3524944, 11.8032167],
  ['341', '3', 36, true, true, 48.3498667, 11.7994083],
  ['342', '3', 36, true, true, 48.3499083, 11.7999500],
  ['343', '3', 36, true, true, 48.3499500, 11.8004917],
  ['344', '3', 36, true, true, 48.3499917, 11.8010333],
  ['345', '3', 36, true, true, 48.3500333, 11.8015750],
  ['346', '3', 36, true, true, 48.3500750, 11.8021167],
  ['347', '3', 36, true, true, 48.3501167, 11.8026583],
  ['348', '3', 36, true, true, 48.3501583, 11.8032000],
  ['349', '3', 36, true, true, 48.3502000, 11.8037417],
  ['352', '3', 65, true, false, 48.3502389, 11.8048639],
  ['352A', '3', 36, true, false, 48.3502167, 11.8045694],
  ['352B', '3', 36, true, false, 48.3502611, 11.8051611],
  ['353', '3', 65, true, false, 48.3503306, 11.8060389],
  ['353A', '3', 36, true, false, 48.3503083, 11.8057417],
  ['353B', '3', 36, true, false, 48.3503528, 11.8063333],
  ['354', '3', 65, true, false, 48.3504167, 11.8071528],
  ['354A', '3', 36, true, false, 48.3503944, 11.8068833],
  ['354B', '3', 36, true, false, 48.3504361, 11.8074250],
  ['355', '3', 65, true, false, 48.3505000, 11.8082389],
  ['355A', '3', 36, true, false, 48.3504778, 11.8079667],
  ['355B', '3', 36, true, false, 48.3505194, 11.8085111],
  ['356', '3', 65, true, false, 48.3505806, 11.8093250],
  ['356A', '3', 36, true, false, 48.3505611, 11.8090528],
  ['356B', '3', 36, true, false, 48.3506028, 11.8095972],
  ['371', '3', 65, true, false, 48.3506694, 11.8104500],
  ['371A', '3', 36, true, false, 48.3506472, 11.8101806],
  ['371B', '3', 36, true, false, 48.3506889, 11.8107222],
  ['372', '3', 65, true, false, 48.3507528, 11.8115583],
  ['372A', '3', 36, true, false, 48.3507306, 11.8112639],
  ['372B', '3', 36, true, false, 48.3507750, 11.8118556],
  ['511', '5', 36, true, false, 48.3525194, 11.8040972, 'ga'],
  ['512', '5', 36, true, false, 48.3525667, 11.8047139, 'ga'],
  ['513', '5', 36, true, false, 48.3526167, 11.8053306, 'ga'],
  ['514', '5', 36, true, false, 48.3526500, 11.8059500, 'ga'],
  ['515', '5', 36, true, false, 48.3526972, 11.8065667, 'ga'],
  ['516', '5', 36, true, false, 48.3527444, 11.8071833, 'ga'],
  ['517', '5', 36, true, false, 48.3527917, 11.8078000, 'ga'],
  ['518', '5', 36, true, false, 48.3528389, 11.8084167, 'ga'],
  ['519', '5', 36, true, false, 48.3528861, 11.8090333, 'ga'],
  ['520', '5', 36, true, false, 48.3529333, 11.8096500, 'ga'],
  ['521', '5', 36, true, false, 48.3529806, 11.8102639, 'ga'],
  ['522', '5', 36, true, false, 48.3530278, 11.8108806, 'ga'],
  ['523', '5', 36, true, false, 48.3530750, 11.8114972, 'ga'],
  ['581', '5', 36, true, true, 48.3593444, 11.8021333, 'ga'],
  ['582', '5', 36, true, true, 48.3593917, 11.8027500, 'ga'],
  ['583', '5', 36, true, true, 48.3594389, 11.8033667, 'ga'],
  ['584', '5', 36, true, true, 48.3594861, 11.8039833, 'ga'],
  ['585', '5', 36, true, true, 48.3595333, 11.8046000, 'ga'],
  ['586', '5', 36, true, false, 48.3595806, 11.8052167, 'ga'],
  ['591', '5', 36, true, false, 48.3577306, 11.8030917, 'ga'],
  ['592', '5', 36, true, false, 48.3577722, 11.8036361, 'ga'],
  ['593', '5', 36, true, false, 48.3578139, 11.8041778, 'ga'],
  ['594', '5', 36, true, false, 48.3578556, 11.8047222, 'ga'],
  ['595', '5', 36, true, false, 48.3578972, 11.8052639, 'ga'],
  ['601', '6', 65, true, true, 48.3455833, 11.7563694],
  ['601A', '6', 36, true, true, 48.3457361, 11.7566167],
  ['601B', '6', 36, true, true, 48.3456944, 11.7560750],
  ['602', '6', 65, true, true, 48.3455000, 11.7552833],
  ['602A', '6', 36, true, true, 48.3456528, 11.7555306],
  ['602B', '6', 36, true, true, 48.3456111, 11.7549889],
  ['603', '6', 65, true, true, 48.3454167, 11.7541972],
  ['603A', '6', 36, true, true, 48.3455694, 11.7544444],
  ['603B', '6', 36, true, true, 48.3455278, 11.7539028],
  ['604', '6', 65, true, true, 48.3453333, 11.7531111],
  ['604A', '6', 36, true, true, 48.3454861, 11.7533611],
  ['604B', '6', 36, true, true, 48.3454444, 11.7528167],
  ['605', '6', 65, true, true, 48.3452472, 11.7520250],
  ['605A', '6', 36, true, true, 48.3454000, 11.7522750],
  ['605B', '6', 36, true, true, 48.3453583, 11.7517306],
  ['606', '6', 65, true, true, 48.3451639, 11.7509389],
  ['606A', '6', 36, true, true, 48.3453167, 11.7511889],
  ['606B', '6', 36, true, true, 48.3452750, 11.7506472],
  ['607', '6', 65, true, true, 48.3450806, 11.7498556],
  ['607A', '6', 36, true, true, 48.3452333, 11.7501056],
  ['607B', '6', 36, true, true, 48.3451917, 11.7495611],
  ['611', '6', 36, true, true, 48.3449000, 11.7469583],
  ['612', '6', 36, true, true, 48.3447556, 11.7466556],
  ['613', '6', 36, true, true, 48.3448556, 11.7464083],
  ['614', '6', 36, true, true, 48.3448139, 11.7458583],
  ['901', '9', 65, true, true, 48.3491333, 11.7727667, 'cargo'],
  ['902', '9', 65, true, true, 48.3490472, 11.7716278, 'cargo'],
  ['903', '9', 65, true, true, 48.3489694, 11.7706222, 'cargo'],
  ['904', '9', 65, true, true, 48.3488806, 11.7694833, 'cargo'],
  ['905', '9', 65, true, true, 48.3488028, 11.7684778, 'cargo'],
  ['906', '9', 65, true, true, 48.3487167, 11.7673389, 'cargo'],
  ['907', '9', 65, true, true, 48.3486389, 11.7663333, 'cargo'],
];

/** Taxiways of the manoeuvring area: no stand lane nodes on them. */
const MANOEUVRING = /^([AB]\d+( ?WEST)?|M|N|S|T)$/;
/** The apron taxiways and taxilanes (stands without a lead-in line in OpenStreetMap are put on the nearest). */
const APRON_LANES = [...new Set(EDDM_LAYOUT.edges.filter(([, , name, kind]) => kind !== 'runway' && !MANOEUVRING.test(name)).map(([, , name]) => name))];

/** A7 and B9 are closed (crossed out on the aerodrome chart): drawn, not used. */
const CLOSED = layoutEdges(EDDM_LAYOUT, { names: ['A7', 'B9'] });

const built = buildLayout(EDDM_LAYOUT, {
  runway: '08L/26R',
  // Aerodrome chart: A1-A15 (no A11) to the northern runway, B1-B15 (no B5) to the southern one. The holding
  // points are the CAT I positions; the CAT II/III positions further out (AIP AD 2.20 3.2.3.2: only during low
  // visibility operations) are drawn as hold lines.
  holdingPoints: {
    'HP.4100096489': 'A1',
    'HP.4100096490': 'A2',
    'HP.4100096492': 'A3',
    'HP.4100096498': 'A4',
    'HP.11593848522': 'A5',
    'HP.4100096499': 'A6',
    'HP.11593848520': 'A8',
    'HP.12569734297': 'A9',
    'HP.4100096500': 'A10',
    'HP.4100096501': 'A12',
    'HP.4100096502': 'A13',
    'HP.4100096503': 'A14',
    'HP.4100096504': 'A15',
    'HP.4100077236': { name: 'B1', runway: '08R/26L' },
    'HP.214111916': { name: 'B2', runway: '08R/26L' },
    'HP.4100077237': { name: 'B3', runway: '08R/26L' },
    'HP.4100077252': { name: 'B4', runway: '08R/26L' },
    'HP.4100077253': { name: 'B6', runway: '08R/26L' },
    'HP.12569497260': { name: 'B7', runway: '08R/26L' },
    'HP.12569497261': { name: 'B8', runway: '08R/26L' },
    'HP.4100077254': { name: 'B10', runway: '08R/26L' },
    'HP.12569497207': { name: 'B11', runway: '08R/26L' },
    'HP.1736747036': { name: 'B12', runway: '08R/26L' },
    'HP.4100077255': { name: 'B13', runway: '08R/26L' },
    'HP.4100077256': { name: 'B14', runway: '08R/26L' },
    'HP.4100077257': { name: 'B15', runway: '08R/26L' },
  },
  // A8 / A9 and B7 / B8 cross each other on the way to the runway: their holding points lie up to 600 m from it.
  maxStripM: 700,
  // B6 / B7 and B8 / B10 / B11 cross each other just before the runway.
  stripsAlongTaxiway: true,
  // The chart writes B12WEST in one word (OpenStreetMap: "B12 WEST").
  taxiwayNames: { 'B12 WEST': 'B12WEST' },
  drawOnly: CLOSED,
  stands: STANDS.map(([id, apron, maxWingspanM, pushback, osm, lat, lon, use]): StandSpec => ({
    id,
    apron: `Apron ${apron}`,
    maxWingspanM,
    pushback,
    pos: { lat, lon },
    ...(osm ? {} : { snap: APRON_LANES }),
    ...(use ? { use } : {}),
  })),
});

/** AIP AD 2.12: the thresholds (none displaced) and the runway ends (the opposite thresholds). */
const DMS = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
const THR_08L = { lat: DMS(48, 21, 45.96), lon: DMS(11, 46, 3.178) };
const THR_26R = { lat: DMS(48, 22, 0.793), lon: DMS(11, 49, 16.222) };
const THR_08R = { lat: DMS(48, 20, 26.413), lon: DMS(11, 45, 3.655) };
const THR_26L = { lat: DMS(48, 20, 41.274), lon: DMS(11, 48, 16.612) };

/** Muenchen Radar for the departures to the south (AIP SID charts); the others call Muenchen Radar north. */
const RADAR_SOUTH = '127.955';
/**
 * RNAV SIDs (AIP AD 2 EDDM 5-7): [08L, 08R, 26L, 26R, exit fix, bearing sector of the destinations, frequency] - the
 * letter names the runway: Q 08L, E 08R, S 26L, N 26R (OBAXA from 08L / 08R: T / P). MIQ (Mike) is not planned
 * automatically. Numbers change with the AIRAC cycle.
 */
const SID_FIXES: [string, string, string, string, string, [number, number], string?][] = [
  ['EVIVA4Q', 'EVIVA4E', 'EVIVA4S', 'EVIVA5N', 'EVIVA', [341, 11]],
  ['AKINI1Q', 'AKINI1E', 'AKINI1S', 'AKINI1N', 'AKINI', [11, 31]],
  ['ANKER9Q', 'ANKER9E', 'ANKER7S', 'ANKER9N', 'ANKER', [31, 60]],
  ['BIBAG2Q', 'BIBAG2E', 'BIBAG3S', 'BIBAG4N', 'BIBAG', [60, 94], RADAR_SOUTH],
  ['KIRDI2Q', 'KIRDI2E', 'KIRDI3S', 'KIRDI4N', 'KIRDI', [94, 118], RADAR_SOUTH],
  ['ROTAX4Q', 'ROTAX4E', 'ROTAX3S', 'ROTAX4N', 'ROTAX', [118, 141], RADAR_SOUTH],
  ['VAVOR3Q', 'VAVOR3E', 'VAVOR3S', 'VAVOR4N', 'VAVOR', [141, 158], RADAR_SOUTH],
  ['TURBU7Q', 'TURBU6E', 'TURBU7S', 'TURBU7N', 'TURBU', [158, 173], RADAR_SOUTH],
  ['TULSI2Q', 'TULSI3E', 'TULSI7S', 'TULSI4N', 'TULSI', [173, 187], RADAR_SOUTH],
  ['OBAXA2T', 'OBAXA2P', 'OBAXA6S', 'OBAXA6N', 'OBAXA', [187, 213], RADAR_SOUTH],
  ['MERSI4Q', 'MERSI4E', 'MERSI5S', 'MERSI6N', 'MERSI', [213, 242], RADAR_SOUTH],
  ['ALG2Q', 'ALG2E', 'ALG2S', 'ALG2N', 'ALG', [242, 257], RADAR_SOUTH],
  ['OLASO2Q', 'OLASO2E', 'OLASO2S', 'OLASO2N', 'OLASO', [257, 277], RADAR_SOUTH],
  ['RIDAR7Q', 'RIDAR7E', 'RIDAR6S', 'RIDAR6N', 'RIDAR', [277, 306]],
  ['GIVMI6Q', 'GIVMI6E', 'GIVMI6S', 'GIVMI1N', 'GIVMI', [306, 327]],
  ['INPUD3Q', 'INPUD3E', 'INPUD2S', 'INPUD2N', 'INPUD', [327, 341]],
];

/**
 * Runway by direction (AIP AD 2.20 3.1.4 / 3.2.1): departures to the north and north-east from the northern runway,
 * to the north-west from 26L or 08L, to the south from the southern runway; arrivals from the north (ROKIL / LANDU)
 * on the northern runway, from the south (NAPSA / BETOS) on the southern one.
 */
const NORTH: [number, number][] = [[270, 90]];
const SOUTH: [number, number][] = [[90, 270]];

/** Exits: rapid where the AIP lists them as high-speed turn-offs (HIRO) or the chart draws them angled. */
const ops = (runway: string, entries: [string, boolean, number][], exits: [string, string, boolean][]) => ({
  runway,
  departureEntries: entries.map(([hp, fullLength, toraM]) => ({ holdingPoint: hp, intersection: hp, fullLength, toraM })),
  exits: exits.map(([name, hp, rapid]) => exitVia(built, name, hp, rapid ? { rapid } : {})),
});

export const EDDM: AirportData = {
  icao: 'EDDM',
  name: 'München',
  city: 'Munich',
  country: 'Germany',
  fir: 'EDMM',
  // AIP AD 2.2: 48°21'13.62"N 011°47'09.91"E.
  arp: { lat: DMS(48, 21, 13.62), lon: DMS(11, 47, 9.91) },
  elevationFt: 1487,
  // AIP: 3.7° E (2026).
  magneticVariation: 3.7,
  timeZone: 'Europe/Berlin',
  // Westerly winds prevail: operating direction 26 about 60 % of the time (estimate).
  wind: { primaryShare: 0.6, primary: [190, 330], secondary: [20, 150] },
  transitionAltitudeFt: 5000,
  // The SIDs climb to 5000 ft.
  initialClimbFt: 5000,
  dataNotice:
    'Layout from OpenStreetMap (© OpenStreetMap contributors, ODbL); runways, declared distances, holding points, high-speed turn-offs, runway use, stand list, frequencies and SIDs after the DFS AIP (AIRAC 2026-10-29, facts only). Stand sizes estimated; maintenance aprons 7 / 8, de-icing areas and the closed taxiways A7 / B9 drawn, not used. Not for real-world navigation.',
  runways: [
    {
      name: '08L/26R',
      widthM: 60,
      lengthM: 4000,
      ends: [
        // AIP: ILS CAT II / III and RNP on all four runway ends.
        { name: '08L', threshold: THR_08L, end: THR_08L, elevationFt: 1467, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '26R', threshold: THR_26R, end: THR_26R, elevationFt: 1449, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
    {
      name: '08R/26L',
      widthM: 60,
      lengthM: 4000,
      ends: [
        { name: '08R', threshold: THR_08R, end: THR_08R, elevationFt: 1486, approaches: ['ILS', 'LOC', 'RNP'] },
        { name: '26L', threshold: THR_26L, end: THR_26L, elevationFt: 1470, approaches: ['ILS', 'LOC', 'RNP'] },
      ],
    },
  ],
  taxiNodes: built.taxiNodes,
  taxiEdges: built.taxiEdges,
  stands: built.stands,
  areas: built.areas,
  buildings: built.buildings,
  pavement: built.pavement,
  // One Ground and one Tower for both runways (AIP: Ground 121.980 north / 121.830 south, Tower 118.705 north /
  // 120.505 south).
  stations: [
    { callsign: 'EDDM_DEL', type: 'DEL', name: 'Muenchen Delivery', frequency: '121.730' },
    { callsign: 'EDDM_GND', type: 'GND', name: 'Muenchen Ground', frequency: '121.980' },
    { callsign: 'EDDM_TWR', type: 'TWR', name: 'Muenchen Tower', frequency: '118.705' },
    { callsign: 'EDDM_APP', type: 'APP', name: 'Muenchen Radar', frequency: '123.905' },
    { callsign: 'EDDM_ATIS', type: 'ATIS', name: 'Muenchen ATIS', frequency: '123.130' },
  ],
  // Declared distances: AIP AD 2.13 and AD 2.20 3.2.3.4. High-speed turn-offs: AIP AD 2.20 3.1.6 (HIRO).
  runwayOps: [
    ops(
      '08L',
      [
        ['A1', true, 4000],
        ['A2', true, 4000],
        ['A3', false, 3885],
        ['A4', false, 3041],
        ['A6', false, 2422],
      ],
      // HIRO: A5 (1270 m), A8 (1710 m), A10 (2260 m).
      [
        ['A5', 'HP.11593848522', true],
        ['A8', 'HP.11593848520', true],
        ['A10', 'HP.4100096500', true],
        ['A12', 'HP.4100096501', true],
        ['A13', 'HP.4100096502', false],
        ['A14', 'HP.4100096503', false],
        ['A15', 'HP.4100096504', false],
      ],
    ),
    ops(
      '26R',
      [
        ['A15', true, 4000],
        ['A14', true, 4000],
        ['A13', false, 3900],
        ['A12', false, 3009],
        ['A10', false, 2489],
      ],
      // HIRO: A9 (1580 m), A6 (2200 m).
      [
        ['A9', 'HP.12569734297', true],
        ['A6', 'HP.4100096499', true],
        ['A4', 'HP.4100096498', true],
        ['A3', 'HP.4100096492', false],
        ['A2', 'HP.4100096490', false],
        ['A1', 'HP.4100096489', false],
      ],
    ),
    ops(
      '08R',
      [
        ['B1', true, 4000],
        ['B2', true, 4000],
        ['B3', false, 3885],
        ['B4', false, 3069],
        ['B6', false, 2449],
      ],
      // HIRO: B7 (1580 m), B10 (2200 m).
      [
        ['B7', 'HP.12569497260', true],
        ['B10', 'HP.4100077254', true],
        ['B12', 'HP.1736747036', true],
        ['B13', 'HP.4100077255', false],
        ['B14', 'HP.4100077256', false],
        ['B15', 'HP.4100077257', false],
      ],
    ),
    ops(
      '26L',
      [
        ['B15', true, 4000],
        ['B14', true, 4000],
        ['B13', false, 3885],
        ['B12', false, 3041],
        ['B10', false, 2429],
      ],
      // HIRO: B11 (1160 m), B8 (1660 m), B6 (2220 m).
      [
        ['B11', 'HP.12569497207', true],
        ['B8', 'HP.12569497261', true],
        ['B6', 'HP.4100077253', true],
        ['B4', 'HP.4100077252', true],
        ['B3', 'HP.4100077237', false],
        ['B2', 'HP.214111916', false],
        ['B1', 'HP.4100077236', false],
      ],
    ),
  ],
  // Both runways for take-offs and landings, independent parallel approaches (AIP AD 2.22), runway by direction.
  parallelRunways: [
    {
      ends: ['26R', '26L'],
      approaches: 'independent',
      departureSectors: { '26R': [[327, 100]], '26L': [[100, 327]] },
      arrivalSectors: { '26R': NORTH, '26L': SOUTH },
    },
    {
      ends: ['08L', '08R'],
      approaches: 'independent',
      departureSectors: { '08L': [[277, 100]], '08R': [[100, 277]] },
      arrivalSectors: { '08L': NORTH, '08R': SOUTH },
    },
  ],
  sids: SID_FIXES.flatMap(([q, e, s, n, fix, towards, frequency]) =>
    (
      [
        [q, '08L'],
        [e, '08R'],
        [s, '26L'],
        [n, '26R'],
      ] as [string, string][]
    ).map(([name, runway]) => ({ name, runway, fix, towards, ...(frequency ? { frequency } : {}) })),
  ),
  systems: ['surveillance', 'vehicles', 'rmca', 'catc', 'routing', 'acdm', 'loc', 'gp'],
  traffic: {
    source: 'Munich Airport route network 2026 (Wikipedia; about 41 million passengers and 330000 movements a year, up to 90 an hour); operator shares estimated',
    rateFactor: 2,
    operators: [
      { airline: 'DLH', weight: 32, types: ['A319', 'A320', 'A20N', 'A321', 'A21N'], destinations: ['EDDH', 'EDDB', 'EDDL', 'EDDK', 'EGLL', 'LFPG', 'LIRF', 'LIMC', 'LEMD', 'LEBL', 'LPPT', 'EHAM', 'EKCH', 'ESSA', 'ENGM', 'EPWA', 'LKPR', 'LHBP', 'LROP', 'LGAV', 'LEPA', 'LCLK', 'LTFM', 'EIDW', 'LSGG'] },
      { airline: 'DLH', weight: 8, types: ['A359', 'A333'], destinations: ['KJFK', 'KEWR', 'KORD', 'KBOS', 'KLAX', 'KSFO', 'KDEN', 'CYYZ', 'CYVR', 'RJAA', 'RKSI', 'ZBAA', 'ZSPD', 'VHHH', 'WSSS', 'VTBS', 'VABB', 'VIDP', 'OMDB', 'SBGR'] },
      { airline: 'CLH', weight: 18, types: ['CRJ9', 'E195', 'A319', 'A320'], destinations: ['EDDH', 'EDDB', 'EDDL', 'EDDK', 'EDDW', 'LOWW', 'LSZH', 'LIPZ', 'LIML', 'LFLL', 'LFMN', 'LDZA', 'LYBE', 'LBSF', 'LWSK', 'EBBR', 'EGCC', 'EGPH', 'EFHK'] },
      { airline: 'EWG', weight: 6, types: ['A319', 'A320', 'A20N'], destinations: ['LEPA', 'GCTS', 'GCLP', 'LGIR', 'LTAI', 'HEGN', 'LPFR', 'LEMG'] },
      { airline: 'CFG', weight: 3, types: ['A320', 'A321'], destinations: ['LEPA', 'GCFV', 'LGKO', 'LTAI'] },
      { airline: 'TUI', weight: 2 },
      { airline: 'SXS', weight: 2, types: ['B738', 'B38M'], destinations: ['LTAI', 'LTBJ', 'LTFJ'] },
      { airline: 'PGT', weight: 1, types: ['A20N'], destinations: ['LTFJ'] },
      { airline: 'AUA', weight: 2, types: ['E195', 'DH8D'], destinations: ['LOWW'] },
      { airline: 'SWR', weight: 1, types: ['A320'], destinations: ['LSZH'] },
      { airline: 'KLM', weight: 2, types: ['B738', 'E195'], destinations: ['EHAM'] },
      { airline: 'AFR', weight: 2, types: ['A320', 'A20N'], destinations: ['LFPG'] },
      { airline: 'BAW', weight: 2, types: ['A320', 'A20N'], destinations: ['EGLL'] },
      { airline: 'THY', weight: 2, types: ['A321', 'B738'], destinations: ['LTFM'] },
      { airline: 'ITY', weight: 1, types: ['A320'], destinations: ['LIRF'] },
      { airline: 'IBE', weight: 1, types: ['A320'], destinations: ['LEMD'] },
      { airline: 'TAP', weight: 1, types: ['A320'], destinations: ['LPPT'] },
      { airline: 'VLG', weight: 1, types: ['A320'], destinations: ['LEBL'] },
      { airline: 'UAE', weight: 1, types: ['B77W'], destinations: ['OMDB'] },
      { airline: 'QTR', weight: 1, types: ['B788', 'A359'], destinations: ['OTHH'] },
      { airline: 'ETD', weight: 1, types: ['B789'], destinations: ['OMAA'] },
      { airline: 'UAL', weight: 1, types: ['B763', 'B788'], destinations: ['KEWR', 'KIAD'] },
      { airline: 'DAL', weight: 0.5, types: ['A333'], destinations: ['KATL'] },
      { airline: 'ACA', weight: 0.5, types: ['B789'], destinations: ['CYYZ'] },
      { airline: 'SIA', weight: 0.5, types: ['A359'], destinations: ['WSSS'] },
      { airline: 'CES', weight: 0.5, types: ['A333'], destinations: ['ZSPD'] },
      { airline: 'BOX', weight: 0.5, types: ['B77L'], destinations: ['EDDF', 'ZSPD'] },
    ],
  },
  briefing: [
    {
      title: 'München in short',
      items: [
        'Two parallel runways 2.3 km apart, each 4000 m: **08L/26R** in the north and **08R/26L** in the south, both for take-offs and landings with **independent parallel approaches**. Westerly winds: operating direction **26** about 60 % of the time.',
        'Runway by direction: departures to the **north and north-east** from the northern runway, to the **south-west, south and south-east** from the southern one; to the north-west from **26L** or **08L**. Arrivals from the north (ROKIL / LANDU) land on the northern runway, from the south (NAPSA / BETOS) on the southern one.',
        'Northern runway: **M** and **N** run along it, **A1-A15** link them to the runway (full length 08L: A1 / A2, 26R: A14 / A15; intersections A3, A4, A6 and A13, A12, A10). High-speed turn-offs: 08L **A5, A8, A10**, 26R **A9, A6**.',
        'Southern runway: **S** and **T** run along it, **B1-B15** link them to the runway (full length 08R: B1 / B2, 26L: B14 / B15; intersections B3, B4, B6 and B13, B12, B10). High-speed turn-offs: 08R **B7, B10**, 26L **B11, B8, B6**. Do not confuse **B12** with **B12WEST** (hot spot).',
        'The terminals lie between the runways: apron 1 (Terminal 1) in the west, aprons 2 and 3 (Terminal 2 and the satellite) in the east; N1-N4 and S5-S8 link them to the parallel taxiways. General aviation on apron 5, cargo on apron 9.',
        'Muenchen Delivery gives the clearances, Muenchen Ground taxis, Muenchen Tower runs both runways. RNAV SIDs - the letter names the runway: **Q** 08L, **E** 08R, **S** 26L, **N** 26R; departures to the south call Muenchen Radar on 127.955. Transition altitude 5000 ft.',
      ],
    },
  ],
};
