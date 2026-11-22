import 'package:flutter/material.dart';

class PaginationControls extends StatelessWidget {
  const PaginationControls({super.key, required this.totalCount, required this.page, required this.pageSize, required this.onPageChanged});
  final int totalCount;
  final int page;
  final int pageSize;
  final ValueChanged<int> onPageChanged;

  @override
  Widget build(BuildContext context) {
    if (totalCount <= pageSize) return const SizedBox.shrink();
    final pageCount = (totalCount / pageSize).ceil();
    final currentPage = page.clamp(0, pageCount - 1).toInt();
    final first = currentPage * pageSize + 1;
    final last = (first + pageSize - 1).clamp(0, totalCount);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(children: [
        Text('Mostrando $first–$last de $totalCount registros · Página ${currentPage + 1} de $pageCount', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          OutlinedButton.icon(onPressed: currentPage > 0 ? () => onPageChanged(currentPage - 1) : null, icon: const Icon(Icons.chevron_left), label: const Text('Anterior')),
          const SizedBox(width: 10),
          OutlinedButton.icon(onPressed: currentPage + 1 < pageCount ? () => onPageChanged(currentPage + 1) : null, icon: const Icon(Icons.chevron_right), label: const Text('Próxima')),
        ]),
      ]),
    );
  }
}
