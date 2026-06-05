import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { RepReportData, ActivityFeedItem } from '@/server/services/report.service';
import { formatIndianCurrency } from '@/server/services/report.service';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111318',
    paddingTop: 52,
    paddingBottom: 54,
    paddingHorizontal: 38,
  },
  header: {
    position: 'absolute',
    top: 16,
    left: 38,
    right: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottom: '1px solid #E2E5F0',
    paddingBottom: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 38,
    right: 38,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #E2E5F0',
    paddingTop: 7,
    fontSize: 8,
    color: '#8891AA',
  },
  brand: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#2D5BE3' },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111318', marginBottom: 8 },
  subtitle: { fontSize: 10, color: '#4A5068' },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#2D5BE3',
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  card: { border: '1px solid #E2E5F0', borderRadius: 6, padding: 10, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  metricCard: { width: '32%', border: '1px solid #E2E5F0', borderRadius: 5, padding: 8, marginBottom: 8 },
  metricValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#111318' },
  metricLabel: { fontSize: 8, color: '#8891AA', marginTop: 3 },
  table: { border: '1px solid #E2E5F0', borderRadius: 4, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F3F5FA', padding: 6, borderBottom: '1px solid #E2E5F0' },
  tableRow: { flexDirection: 'row', padding: 6, borderBottom: '1px solid #F0F2F7' },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#4A5068' },
  td: { fontSize: 8.5, color: '#111318' },
  highlight: { flexDirection: 'row', marginBottom: 5 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#2D5BE3', marginRight: 6, marginTop: 4 },
  feedItem: { paddingVertical: 5, borderBottom: '0.5px solid #F0F2F7' },
});

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function Header({ data }: { data: RepReportData }) {
  return (
    <View fixed style={styles.header}>
      <Text style={styles.brand}>SecComply</Text>
      <Text style={{ color: '#4A5068', fontSize: 8 }}>{data.rep.name} · {formatDate(data.period.dateFrom)} - {formatDate(data.period.dateTo)}</Text>
    </View>
  );
}

function Footer() {
  return (
    <View fixed style={styles.footer}>
      <Text>Confidential - SecComply Internal Report</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{String(value)}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CoverPage({ data }: { data: RepReportData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Header data={data} />
      <Footer />
      <Text style={styles.title}>Activity Performance Report</Text>
      <Text style={styles.subtitle}>{data.rep.name} · {data.rep.role}</Text>
      <Text style={[styles.subtitle, { marginTop: 2 }]}>{data.rep.email}</Text>
      <Text style={[styles.subtitle, { marginTop: 10 }]}>Period: {formatDate(data.period.dateFrom)} - {formatDate(data.period.dateTo)}</Text>
      {data.appliedFilters.length ? (
        <>
          <Text style={styles.sectionTitle}>Applied Filters</Text>
          <View style={styles.card}>
            {data.appliedFilters.map((item) => (
              <View key={item} style={styles.highlight}>
                <View style={styles.dot} />
                <Text>{item}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Text style={styles.sectionTitle}>Highlights</Text>
      <View style={styles.card}>
        {(data.highlights.length ? data.highlights : ['No major highlights detected for this period.']).map((item) => (
          <View key={item} style={styles.highlight}>
            <View style={styles.dot} />
            <Text>{item}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

function SummaryPage({ data }: { data: RepReportData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Header data={data} />
      <Footer />
      <Text style={styles.sectionTitle}>Activity Summary</Text>
      <View style={styles.row}>
        <Metric label="Total activities" value={data.summary.totalActivities} />
        <Metric label="Avg activities/day" value={data.summary.avgActivitiesPerDay} />
        <Metric label="Active days" value={`${data.summary.activeDays}/${data.summary.workingDays}`} />
      </View>
      <View style={styles.row}>
        <Metric label="Calls connected" value={`${data.summary.calls.connected}/${data.summary.calls.total}`} />
        <Metric label="Connection rate" value={`${data.summary.calls.connectionRate}%`} />
        <Metric label="Talk time" value={`${data.summary.calls.totalMinutes} min`} />
      </View>
      <View style={styles.row}>
        <Metric label="Emails sent" value={data.summary.emails.sent} />
        <Metric label="Meetings/Demos" value={data.summary.meetings + data.summary.demos} />
        <Metric label="Contacts touched" value={data.summary.uniqueContactsTouched} />
      </View>
    </Page>
  );
}

function PipelinePage({ data }: { data: RepReportData }) {
  const hideMoney = Boolean(data.monetaryValuesHidden);
  return (
    <Page size="A4" style={styles.page}>
      <Header data={data} />
      <Footer />
      <Text style={styles.sectionTitle}>Pipeline Contribution</Text>
      <View style={styles.row}>
        <Metric label="Leads added" value={data.pipeline.leadsAdded} />
        <Metric label="Prospects created" value={data.pipeline.dealsCreated} />
        {!hideMoney && <Metric label="Created value" value={formatIndianCurrency(data.pipeline.dealsCreatedValue)} />}
      </View>
      <View style={styles.row}>
        <Metric label="Prospects won" value={data.pipeline.dealsWon} />
        {!hideMoney && <Metric label="Revenue won" value={formatIndianCurrency(data.pipeline.revenueWon)} />}
        <Metric label="Win rate" value={`${data.pipeline.winRate}%`} />
      </View>
      <View style={styles.row}>
        <Metric label="Open prospects" value={data.pipeline.openDeals} />
        {!hideMoney && <Metric label="Open pipeline" value={formatIndianCurrency(data.pipeline.openPipelineValue)} />}
        {!hideMoney && <Metric label="Weighted pipeline" value={formatIndianCurrency(data.pipeline.weightedPipeline)} />}
      </View>
      <Text style={styles.sectionTitle}>Top Prospects</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: hideMoney ? '58%' : '42%' }]}>Prospect</Text>
          <Text style={[styles.th, { width: '24%' }]}>Stage</Text>
          <Text style={[styles.th, { width: '18%' }]}>Status</Text>
          {!hideMoney && <Text style={[styles.th, { width: '16%' }]}>Amount</Text>}
        </View>
        {data.topDeals.map((deal) => (
          <View key={deal.id} style={styles.tableRow}>
            <Text style={[styles.td, { width: hideMoney ? '58%' : '42%' }]}>{deal.title}</Text>
            <Text style={[styles.td, { width: '24%' }]}>{deal.stageName ?? '-'}</Text>
            <Text style={[styles.td, { width: '18%' }]}>{deal.status}</Text>
            {!hideMoney && <Text style={[styles.td, { width: '16%' }]}>{formatIndianCurrency(deal.amount)}</Text>}
          </View>
        ))}
      </View>
    </Page>
  );
}

function DemoPage({ data }: { data: RepReportData }) {
  return (
    <Page size="A4" style={styles.page}>
      <Header data={data} />
      <Footer />
      <Text style={styles.sectionTitle}>Demo & Discovery Analysis</Text>
      <View style={styles.row}>
        <Metric label="Total demos" value={data.demoAnalysis.total} />
        <Metric label="Interest rate" value={`${data.demoAnalysis.interestedRate}%`} />
        <Metric label="Overdue follow-ups" value={data.demoAnalysis.overdueFollowUps} />
      </View>
      <Text style={styles.sectionTitle}>Weekly Breakdown</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: '28%' }]}>Week</Text>
          <Text style={[styles.th, { width: '14%' }]}>Total</Text>
          <Text style={[styles.th, { width: '14%' }]}>Calls</Text>
          <Text style={[styles.th, { width: '14%' }]}>Emails</Text>
          <Text style={[styles.th, { width: '14%' }]}>Meetings</Text>
          <Text style={[styles.th, { width: '16%' }]}>Contacts</Text>
        </View>
        {data.weeklyBreakdown.map((week) => (
          <View key={week.weekStart} style={styles.tableRow}>
            <Text style={[styles.td, { width: '28%' }]}>{week.label}</Text>
            <Text style={[styles.td, { width: '14%' }]}>{week.total}</Text>
            <Text style={[styles.td, { width: '14%' }]}>{week.calls}</Text>
            <Text style={[styles.td, { width: '14%' }]}>{week.emails}</Text>
            <Text style={[styles.td, { width: '14%' }]}>{week.meetings + week.demos}</Text>
            <Text style={[styles.td, { width: '16%' }]}>{week.contactsTouched}</Text>
          </View>
        ))}
      </View>
    </Page>
  );
}

function ActivityFeedPages({ data }: { data: RepReportData }) {
  const chunks: ActivityFeedItem[][] = [];
  for (let index = 0; index < data.activityFeed.length; index += 28) {
    chunks.push(data.activityFeed.slice(index, index + 28));
  }

  return (
    <>
      {(chunks.length ? chunks : [[]]).map((chunk, index) => (
        <Page key={index} size="A4" style={styles.page}>
          <Header data={data} />
          <Footer />
          <Text style={styles.sectionTitle}>Activity Feed {index > 0 ? `(continued)` : ''}</Text>
          {chunk.map((item) => (
            <View key={item.id} style={styles.feedItem}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>
                {formatDate(item.occurredAt)} · {item.activityType.replace(/_/g, ' ')}
              </Text>
              <Text>{item.subject ?? 'No subject'}{item.contactName ? ` · ${item.contactName}` : ''}{item.companyName ? ` @ ${item.companyName}` : ''}</Text>
              {item.dealTitle ? <Text style={{ color: '#4A5068' }}>Prospect: {item.dealTitle}</Text> : null}
            </View>
          ))}
        </Page>
      ))}
    </>
  );
}

export async function generateReportPDF(data: RepReportData): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <CoverPage data={data} />
      <SummaryPage data={data} />
      <PipelinePage data={data} />
      <DemoPage data={data} />
      <ActivityFeedPages data={data} />
    </Document>
  );
}
