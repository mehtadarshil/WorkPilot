import type { SiteReportTemplateDefinition, SiteReportTemplateField, SiteReportTemplateSection } from './types';

function f(
  id: string,
  label: string,
  type: SiteReportTemplateField['type'],
  extra?: Partial<Pick<SiteReportTemplateField, 'content' | 'rows'>>,
): SiteReportTemplateField {
  return { id, label, type, ...extra };
}

/** Fire Risk Assessment — fields aligned to the sample PDF (4 pages). Editable in Settings → Site report templates. */
export function getFraTemplateDefinition(): SiteReportTemplateDefinition {
  const sections: SiteReportTemplateSection[] = [
    {
      id: 'client_header',
      title: 'Client details',
      omit_from_pdf: true,
      helper_text: 'Client name and property address are filled from WorkPilot on the customer report screen.',
      fields: [
        f('client_name_display', 'Client name', 'static_text', {
          content: '(Pulled from WorkPilot — shown in the report header above.)',
        }),
        f('property_address_display', 'Property address', 'static_text', {
          content: '(Pulled from WorkPilot — shown in the report header above.)',
        }),
      ],
    },
    {
      id: 'property_details',
      title: 'Property details',
      fields: [
        f('before_work_site_photo', 'Before work — site photo', 'image'),
        f('use_of_premises', 'Use of premises', 'text'),
        f('number_of_floors', 'Number of floors (inc. ground floor)', 'text'),
        f('construction_date', 'Approximate date of construction', 'text'),
        f('construction_details', 'Details of construction', 'text'),
        f('at_risk_tenants', "Are there any ‘at risk’ tenants?", 'yes_no_na'),
        f('fire_loss_history', 'Is there any previous history of fire loss in the premises?', 'yes_no_na'),
        f('property_details_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 4 }),
      ],
    },
    {
      id: 'electrical',
      title: 'Electrical installations & equipment',
      allow_section_images: true,
      fields: [
        f(
          'elec_fixed_inspection',
          'Are fixed installations periodically inspected and tested at least every 5 years?',
          'yes_no_na',
        ),
        f(
          'elec_cert_advice',
          '',
          'static_text',
          {
            content:
              'It is advised for all certifications to be present on site upon request.',
          },
        ),
        f(
          'elec_portable_inspection',
          'Are electrical equipment & portable appliances periodically inspected & tested?',
          'yes_no_na',
        ),
        f('elec_trailing_leads', 'Is the use of trailing leads and adaptors avoided where possible?', 'yes_no_na'),
        f('elec_wiring_supported', 'Is wiring adequately supported where exposed?', 'yes_no_na'),
        f('electrical_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 4 }),
      ],
    },
    {
      id: 'smoking',
      title: 'Smoking',
      fields: [
        f('smoke_measures', 'Are adequate measures in place to stop people from smoking in the premises?', 'yes_no_na'),
        f('smoke_signs', "Are ‘No Smoking’ signs provided?", 'yes_no_na'),
        f(
          'smoke_regulations_note',
          '',
          'static_text',
          {
            content:
              'No smoking is permitted within the common area of the premises. There is no control over smoking within the private dwellings. Inform all residents that in accordance with The Smoke-free Regulations 2006, no smoking is allowed in the common areas of the property.',
          },
        ),
        f('smoking_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'arson',
      title: 'Arson',
      fields: [
        f('arson_secured', 'Are the premises adequately secured to prevent unauthorised access?', 'yes_no_na'),
        f(
          'arson_waste',
          'Are combustible materials, waste & refuse bins stored safely clear of the premises or in purpose-built compounds/rooms?',
          'yes_no_na',
        ),
        f('arson_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'heating',
      title: 'Heating systems & portable heaters',
      fields: [
        f('heating_portable_inspection', 'Are portable heaters subject to periodic inspection and testing?', 'yes_no_na'),
        f(
          'heating_fixed_maintenance',
          'Are fixed heating systems subject to periodic maintenance? (describe evidence, gas records, etc.)',
          'textarea',
          { rows: 5 },
        ),
        f('heating_gas_meter_location', 'Gas meter location (if applicable)', 'text'),
        f('heating_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'cooking',
      title: 'Cooking & ventilation',
      fields: [
        f('cooking_prevent_fires', 'Are adequate measures taken to prevent fires from cooking?', 'yes_no_na'),
        f('cooking_filters', 'Are filters & ductwork subject to regular cleaning?', 'yes_no_na'),
        f('cooking_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'housekeeping',
      title: 'Housekeeping',
      fields: [
        f('hk_standard', 'Is the standard of housekeeping adequate?', 'yes_no_na'),
        f('hk_separate_combustible', 'Are combustible materials kept separate from ignition and heat sources?', 'yes_no_na'),
        f('hk_waste_accumulation', 'Is the unnecessary accumulation of combustible waste avoided?', 'yes_no_na'),
        f('hk_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'other_hazards',
      title: 'Other significant fire hazards',
      fields: [
        f('other_significant', 'Are there any other significant fire hazards in the premises?', 'yes_no_na'),
        f(
          'other_inspection_guidance',
          '',
          'static_text',
          {
            content:
              'It is advised that regular inspections are carried out at the property. All tenants to report any faults to the responsible person.',
          },
        ),
        f('other_hazards_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'fire_barriers',
      title: 'Fire barriers',
      fields: [
        f(
          'fb_means_between_floors',
          'Is there means of fire safety between various floors and walls in the building to prevent the spread of fire and keep the fire contained?',
          'yes_no_na',
        ),
        f(
          'fb_fire_collars',
          'Have fire collars been used between floors and walls to prevent the spread of fire?',
          'yes_no_na',
        ),
        f('fb_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'means_of_escape',
      title: 'Means of escape',
      fields: [
        f('escape_routes_clear', 'Are all escape routes kept clear of obstruction to enable people to escape safely?', 'yes_no_na'),
        f('escape_exits_openable', 'Are all fire exits easily and immediately openable?', 'yes_no_na'),
        f('escape_travel_distances', 'Are distances of travel considered reasonable?', 'yes_no_na'),
        f('escape_inner_rooms', 'Are all suitable precautions in place for all inner rooms?', 'yes_no_na'),
        f(
          'escape_stairway_protection',
          'Is adequate fire protection provided to stairways and escape routes, including fire doors, intumescent strips and self-closures?',
          'yes_no_na',
        ),
        f(
          'escape_disabled',
          'Are reasonable arrangements in place for the safe evacuation of disabled employees and other disabled persons on the premises?',
          'yes_no_na',
        ),
        f('escape_fire_doors_standards', 'Do fire doors meet current standards?', 'yes_no_na'),
        f('escape_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'warning',
      title: 'Means of giving warning in case of fire',
      fields: [
        f('warn_alarm_system', 'Is there a suitable electrical fire alarm system?', 'yes_no_na'),
        f(
          'warn_detectors',
          'Are automatic smoke/heat detectors provided and is the extent and coverage considered adequate?',
          'yes_no_na',
        ),
        f('warn_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'emergency_lighting',
      title: 'Emergency escape lighting',
      fields: [
        f(
          'el_standard',
          'Is there reasonable standard of emergency escape lighting to illuminate escape routes and areas without natural lighting?',
          'yes_no_na',
        ),
        f(
          'el_disclaimer',
          '',
          'static_text',
          {
            content:
              'Emergency lighting checks are purely on a visual basis. No test of luminaire levels or verification of full compliance with relevant British Standards have been carried out during this assessment.',
          },
        ),
        f('el_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'signs',
      title: 'Fire safety signs and notices',
      fields: [
        f('signs_exit', 'Is there reasonable standard of fire exit signage and fire safety signs?', 'yes_no_na'),
        f(
          'signs_notices',
          'Are general fire notices, detailing the action to take in the event of a fire, provided and sited in prominent locations?',
          'yes_no_na',
        ),
        f('signs_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'extinguishers',
      title: 'Manual fire extinguishers & fire blankets',
      fields: [
        f('ext_provision', 'Is there reasonable provision of fire extinguishers & fire blankets?', 'yes_no_na'),
        f('ext_notes', 'Notes (advised but not limited to)', 'textarea', { rows: 3 }),
      ],
    },
    {
      id: 'management',
      title: 'Management of fire safety',
      fields: [
        f('mgmt_appointed', 'Has someone been appointed to manage fire safety?', 'yes_no_na'),
        f(
          'mgmt_evac_plan',
          'Evacuation plan / occupier information (comments)',
          'textarea',
          {
            rows: 3,
          },
        ),
        f('mgmt_fire_procedures', 'Are procedures in the event of a fire appropriate and properly documented?', 'yes_no_na'),
        f('mgmt_assembly_suitable', 'Is there a suitable fire assembly point(s)?', 'yes_no_na'),
        f('mgmt_assembly_location', 'Assembly point location(s)', 'text'),
        f('mgmt_in_house_inspections', 'Are regular in-house inspections of fire precautions carried out?', 'yes_no_na'),
        f('mgmt_testing_records', 'Are records of testing and maintenance maintained?', 'yes_no_na'),
        f('mgmt_alarm_testing_documented', 'Is there documented fire alarm testing at least every 6 months?', 'yes_no_na'),
        f('mgmt_el_testing_documented', 'Is there documented emergency lighting testing at least every 6 months?', 'yes_no_na'),
      ],
    },
  ];

  const footer = {
    title: 'Certificate of commissioning',
    allow_section_images: true,
    fields: [
      f(
        'cert_body',
        '',
        'static_text',
        {
          content:
            'This document is only a risk assessment which outlines potential risks at the time of my visit to the property. It is down to the person ordering this report or the responsible person to rectify any potential risks we have found based on this report. Some assumptions may have been made, based on information provided to us by either the client or responsible person outlined at the beginning of this risk assessment. Anything that happens after my visit is not mine nor the company’s responsibility. I hereby confirm that the fire risk assessment at the above premises has been carried out and inspected by me to the best of my knowledge and belief.',
        },
      ),
      f('cert_inspector_name', 'Name', 'text'),
      f('cert_signature', 'Signature', 'signature'),
      f('cert_date', 'Date', 'date'),
    ],
  };

  return {
    version: 1,
    report_title_default: 'Fire Risk Assessment',
    sections,
    footer,
  };
}
