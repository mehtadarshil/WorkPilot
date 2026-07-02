import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/values/app_colors.dart';
import '../../widgets/searchable_select_field.dart';
import 'customer_tabs/helpers.dart';
import 'customer_tabs/shell.dart';

class CustomerNewJobCustomerPanel extends StatelessWidget {
  const CustomerNewJobCustomerPanel({
    super.key,
    required this.customer,
    required this.selectedWorkAddress,
    required this.customerId,
    required this.customerLocked,
    required this.saving,
    required this.customerOptions,
    required this.workAddressOptions,
    required this.workAddressId,
    required this.workAddresses,
    required this.onCustomerChanged,
    required this.onWorkAddressChanged,
  });

  final Map<String, dynamic>? customer;
  final Map<String, dynamic>? selectedWorkAddress;
  final int customerId;
  final bool customerLocked;
  final bool saving;
  final List<SelectOption<int>> customerOptions;
  final List<SelectOption<int>> workAddressOptions;
  final int? workAddressId;
  final List<Map<String, dynamic>> workAddresses;
  final ValueChanged<int?> onCustomerChanged;
  final ValueChanged<int?> onWorkAddressChanged;

  @override
  Widget build(BuildContext context) {
    final addressSource = selectedWorkAddress ?? customer;
    final addressLabel = selectedWorkAddress == null ? 'Customer address' : 'Work address';
    final addressStr = addressSource == null
        ? ''
        : [
            ctStr(addressSource, 'address_line_1'),
            ctStr(addressSource, 'address_line_2'),
            ctStr(addressSource, 'address_line_3'),
            ctStr(addressSource, 'town'),
            ctStr(addressSource, 'county'),
            ctStr(addressSource, 'postcode'),
          ].where((e) => e.isNotEmpty).join(', ');

    return customerPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SearchableSelectField<int>(
            label: 'Customer *',
            hint: 'Choose customer',
            sheetTitle: 'Customer',
            value: customerOptions.any((o) => o.value == customerId) ? customerId : null,
            enabled: !customerLocked && !saving,
            options: customerOptions,
            decoration: customerInputDecoration('Choose customer'),
            onChanged: customerLocked ? null : onCustomerChanged,
          ),
          if (customerLocked && customer != null) ...[
            const SizedBox(height: 8),
            Text(
              'Customer: ${ctStr(customer!, 'full_name')}',
              style: GoogleFonts.inter(color: AppColors.slate900, fontWeight: FontWeight.w600),
            ),
          ],
          if (addressStr.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              '$addressLabel: $addressStr',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.slate500),
            ),
          ],
          if (customerId > 0) ...[
            const SizedBox(height: 14),
            SearchableSelectField<int>(
              label: 'Site / work address (optional)',
              hint: 'Use customer address',
              sheetTitle: 'Site / work address',
              value: workAddressOptions.any((o) => o.value == workAddressId) ? workAddressId : null,
              allowClear: true,
              clearLabel: 'Use customer address',
              enabled: !saving,
              options: workAddressOptions,
              decoration: customerInputDecoration('Use customer address'),
              onChanged: onWorkAddressChanged,
            ),
            const SizedBox(height: 6),
            Text(
              workAddresses.isEmpty
                  ? 'No site/work addresses found for this customer.'
                  : 'Optional: choose where this job will be carried out.',
              style: GoogleFonts.inter(fontSize: 11, color: AppColors.slate400),
            ),
          ],
        ],
      ),
    );
  }
}
