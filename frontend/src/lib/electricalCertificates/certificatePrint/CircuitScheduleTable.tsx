import type { BoardRecord, CircuitRow } from '../types';
import {
  PRINT_CIRCUIT_COLUMNS,
  circuitCellValue,
  printCircuitColumnGroups,
} from './circuitScheduleColumns';
import { PrintCheckmark } from './PrintCheckmark';

function CircuitCell({ circuit, col }: { circuit: CircuitRow; col: (typeof PRINT_CIRCUIT_COLUMNS)[number] }) {
  const raw = circuitCellValue(circuit, col.key);
  if (col.checkmark) return <PrintCheckmark value={raw} />;
  return <>{raw}</>;
}

export function CircuitScheduleTable({ circuits }: { circuits: CircuitRow[] }) {
  const groups = printCircuitColumnGroups();

  return (
    <table className="cp-circuit-table">
      <colgroup>
        {PRINT_CIRCUIT_COLUMNS.map((col) => (
          <col key={col.key} style={{ width: `${col.widthMm}mm` }} />
        ))}
      </colgroup>
      <thead>
        <tr className="cp-group-row">
          {groups.map((g, i) => (
            <th key={`${g.label}-${i}`} colSpan={g.span}>
              {g.label}
            </th>
          ))}
        </tr>
        <tr className="cp-col-row">
          {PRINT_CIRCUIT_COLUMNS.map((col) => (
            <th
              key={col.key}
              className={col.vertical && !col.description ? 'cp-th-v' : 'cp-th-h'}
            >
              {col.vertical && !col.description ? col.shortLabel : col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {circuits.length > 0 ? (
          circuits.map((circuit) => (
            <tr key={circuit.id}>
              {PRINT_CIRCUIT_COLUMNS.map((col) => (
                <td key={col.key} className={col.description ? 'cp-desc' : undefined}>
                  <CircuitCell circuit={circuit} col={col} />
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={PRINT_CIRCUIT_COLUMNS.length} className="cp-check-muted">
              No circuits recorded
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function BoardDetailsGrid({ board }: { board: BoardRecord }) {
  return (
    <>
      <p className="cp-board-subtitle">{board.name} — Board details</p>
      <table className="cp-board-details">
        <tbody>
          <tr>
            <td><strong>Location:</strong> {board.location || '—'}</td>
            <td><strong>Manufacturer:</strong> {board.manufacturer || '—'}</td>
            <td><strong>Supplied from:</strong> {board.suppliedFrom || '—'}</td>
            <td>
              <strong>Polarity confirmed:</strong>{' '}
              <PrintCheckmark value={board.polarityConfirmed} />
            </td>
            <td><strong>Phases:</strong> {board.phases || '—'}</td>
            <td><strong>Phase seq:</strong> {board.phaseSequence || '—'}</td>
          </tr>
          <tr>
            <td><strong>Zs at DB:</strong> {board.zsAtDb ? `${board.zsAtDb} Ω` : '—'}</td>
            <td><strong>IPF at DB:</strong> {board.ipfAtDb ? `${board.ipfAtDb} kA` : '—'}</td>
            <td>
              <strong>Main switch:</strong>{' '}
              {[board.mainSwitchBs, board.mainSwitchVoltage, board.mainSwitchRating].filter(Boolean).join(' / ') || '—'}
            </td>
            <td>
              <strong>RCD:</strong>{' '}
              {[board.rcdRating, board.rcdTripTime].filter(Boolean).join(' / ') || '—'}
            </td>
            <td>
              <strong>SPD:</strong>{' '}
              {[board.spdType, board.spdStatus].filter(Boolean).join(' / ') || '—'}
            </td>
            <td>
              <strong>OCPD:</strong>{' '}
              {[board.ocpdBs, board.ocpdVoltage, board.ocpdRating].filter(Boolean).join(' / ') || '—'}
            </td>
          </tr>
          {board.notes.trim() && (
            <tr>
              <td colSpan={6}>
                <strong>Notes:</strong> {board.notes}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export function BoardTestingFooter({
  boardName,
  testedBy,
  position,
  testedDate,
}: {
  boardName: string;
  testedBy: string;
  position: string;
  testedDate: string;
}) {
  if (!testedBy && !position && !testedDate) return null;
  return (
    <div className="cp-board-testing">
      <strong>{boardName} — Testing information</strong>
      {' · '}
      {testedBy && (
        <>
          <strong>Tested by:</strong> {testedBy}
          {' · '}
        </>
      )}
      {position && (
        <>
          <strong>Position:</strong> {position}
          {' · '}
        </>
      )}
      {testedDate && (
        <>
          <strong>Date tested:</strong> {testedDate}
        </>
      )}
    </div>
  );
}
