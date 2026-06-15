import {
  ArrowLeftRight,
  BookOpen,
  Scale,
  FileText,
  BarChart3,
  Briefcase,
} from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeaturesSection = () => {
  const features: Feature[] = [
    {
      icon: <ArrowLeftRight className="w-8 h-8 text-blue-400" />,
      title: 'Double Entry Transactions',
      description:
        'Record balanced debit and credit transactions with intelligent bookkeeping workflows.',
    },
    {
      icon: <BookOpen className="w-8 h-8 text-blue-400" />,
      title: 'General Ledger',
      description:
        'Track complete accounting history with categorized ledger records and running balances.',
    },
    {
      icon: <Scale className="w-8 h-8 text-blue-400" />,
      title: 'Trial Balance',
      description:
        'Verify financial integrity with automatically balanced debit and credit summaries.',
    },
    {
      icon: <FileText className="w-8 h-8 text-blue-400" />,
      title: 'Financial Statements',
      description:
        'Generate professional statements of financial position, activities, and cash flows.',
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-blue-400" />,
      title: 'Financial Analytics',
      description:
        'Visualize revenue, expenses, trends, and operational performance in real time.',
    },
    {
      icon: <Briefcase className="w-8 h-8 text-blue-400" />,
      title: 'Project & Fund Tracking',
      description:
        'Monitor budgets, grants, and institutional projects with allocation visibility.',
    },
  ];

  return (
    <section id="features" className="py-28 px-6 bg-transparent">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block mb-4">
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10">
              CORE FEATURES
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
            Everything needed to manage institutional finances
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            StatementStudio centralizes bookkeeping, financial reporting,
            analytics, and project budgeting into one modern accounting
            workspace.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group rounded-2xl bg-slate-900/80 border border-slate-800 p-8 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10"
            >
              <div className="mb-4 text-blue-400 group-hover:scale-110 transition-transform duration-300">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
