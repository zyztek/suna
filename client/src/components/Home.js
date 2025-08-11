
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">
              Build Your Ultimate
              <span className="gradient-text"> Knowledge Base</span>
            </h1>
            <p className="hero-description">
              A powerful SaaS platform that transforms how you create, share, and discover knowledge.
              Get personalized recommendations powered by AI and connect with a community of learners.
            </p>
            <div className="hero-actions">
              {user ? (
                <Link to="/dashboard" className="btn btn-primary">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-primary">
                    Get Started Free
                  </Link>
                  <Link to="/knowledge-base" className="btn btn-secondary">
                    Explore Articles
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hero-image">
            <div className="floating-card">
              <div className="card-header">
                <div className="card-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              <div className="card-content">
                <div className="code-line">
                  <span className="keyword">const</span> knowledge = 
                  <span className="string">"power"</span>
                </div>
                <div className="code-line">
                  <span className="keyword">export</span> 
                  <span className="function">shareKnowledge</span>()
                </div>
                <div className="code-line">
                  <span className="comment">// Build the future</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <div className="section-header">
            <h2>Why Choose Our Platform?</h2>
            <p>Everything you need to build and scale your knowledge base</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🧠</div>
              <h3>AI-Powered Recommendations</h3>
              <p>Get personalized content suggestions based on your interests and reading history</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Lightning Fast</h3>
              <p>Built for performance with modern technology stack and optimized for speed</p>
            </div>
            <div className="feature-card">
              <div-icon">🔒</div>
              <h3>Secure & Reliable</h3>
              <p>Enterprise-grade security with comprehensive error monitoring and uptime guarantees</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎨</div>
              <h3>Beautiful Design</h3>
              <p>Clean, modern interface that makes creating and reading content a pleasure</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🚀</div>
              <h3>Scalable</h3>
              <p>Grows with you from personal use to enterprise-level knowledge management</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🤝</div>
              <h3>Community Driven</h3>
              <p>Connect with other learners, share insights, and build knowledge together</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-number">1000+</div>
              <div className="stat-label">Active Users</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">5000+</div>
              <div className="stat-label">Articles Published</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">50+</div>
              <div className="stat-label">Categories</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">99.9%</div>
              <div className="stat-label">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Start Building?</h2>
            <p>Join thousands of users who are already building amazing knowledge bases</p>
            {!user && (
              <Link to="/register" className="btn btn-primary btn-large">
                Create Your Account
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
