import type { SiteReportTemplateDefinition } from './types';

export function getDrainBlockingReportDefinition(): SiteReportTemplateDefinition {
  return {
    version: 1,
    report_title_default: 'Quote & Completed Works Report',
    sections: [
      {
        id: 'client_site',
        title: 'Client and site',
        fields: [
          { id: 'client_name', label: 'Client', type: 'text' },
          { id: 'building_name', label: 'Building / property', type: 'text' },
        ],
      },
      {
        id: 'summary',
        title: 'Summary of investigation and works conducted',
        fields: [
          {
            id: 'summary_text',
            label: 'Investigation and works summary',
            type: 'textarea',
            rows: 12,
          },
        ],
      },
      {
        id: 'site_photos',
        title: 'Site photos',
        allow_section_images: true,
        fields: [
          {
            id: 'site_photo_notes',
            label: 'Photo notes',
            type: 'textarea',
            rows: 4,
          },
        ],
      },
      {
        id: 'recommendations',
        title: 'Recommendations',
        fields: [
          {
            id: 'recommendations_text',
            label: 'Recommendations',
            type: 'textarea',
            rows: 8,
          },
        ],
      },
      {
        id: 'cost_breakdown',
        title: 'Cost breakdown',
        fields: [
          {
            id: 'cost_breakdown_text',
            label: 'Cost breakdown',
            type: 'textarea',
            rows: 5,
          },
        ],
      },
    ],
  };
}
